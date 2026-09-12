import { randomBytes } from 'node:crypto'

import { NextResponse } from 'next/server'

import { getCurrentMember } from '@/lib/auth'
import { db } from '@/lib/db'
import { entitlementActive } from '@/lib/entitlements'
import { appBaseUrl } from '@/lib/env'
import { syncProductAccess } from '@/lib/product-auth'
import {
  mintProductSession,
  refusalDestination,
  sessionRedirect,
  ssoConfigured,
  ssoItemSlug,
  ssoRefusal,
} from '@/lib/sso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const HERE = '/api/sso/ramp'

/**
 * Sign in to Nexus RAMP, from a portal session.
 *
 * The only route into the product. Somebody clicks through from the portal — or lands on
 * RAMP's sign-in page and clicks one button, which sends them here — and arrives already
 * signed in, with no second password to remember and nothing to keep in step.
 *
 * ## What it checks, in order
 *
 * A portal session, then a **live entitlement to the product**. The second is the one the
 * desk asked for and the one that matters: being a NordStar member is not access to RAMP,
 * and it must not become access because somebody found this URL. The check happens at
 * every crossing, so a lapsed subscription stops working immediately here rather than
 * waiting for the nightly job — and the nightly job additionally disables the account
 * there, which stops Supabase refreshing a session already open.
 *
 * ## Why it redirects rather than returning JSON
 *
 * It is a link somebody clicks, not an API a program calls. Every refusal lands on a page
 * that explains itself — the sign-in page with a return address, or the dashboard, which
 * shows what they do hold and offers a trial if they hold nothing.
 */
export async function GET() {
  const member = await getCurrentMember()
  const base = appBaseUrl()

  const slug = ssoItemSlug()
  const configured = ssoConfigured()

  let entitled = false
  let hasAccount = false
  let productUrl: string | null = null

  if (member) {
    const item = await db.item.findUnique({
      where: { slug },
      select: { id: true, url: true },
    })

    if (item) {
      productUrl = item.url
      const entitlement = await db.entitlement.findFirst({
        where: { memberId: member.id, itemId: item.id },
        select: { status: true, renewsAt: true },
      })
      /*
       * Admins pass the gate without an entitlement, so support can open the product a
       * customer is stuck in. Deliberately decided here and not by the shared
       * entitlement rule, which stays strict: a research membership must never become
       * product access, and `hasItem` keeping its own admin exception is about reading
       * data, not about being handed a session.
       */
      entitled =
        member.role === 'admin' || (entitlement ? entitlementActive(entitlement) : false)

      /*
       * Provision on the way through if it has not happened yet.
       *
       * A grant made while the product's auth system was unreachable, or before the keys
       * were set, leaves an entitlement with no account behind it. Rather than send a
       * paying subscriber away to wait for the nightly job, try once, here, now — there
       * is no password to hand over at this point, so this only succeeds for somebody
       * whose account merely needed re-enabling.
       */
      if (entitled) {
        const account = await db.productAccount.findUnique({
          where: { memberId_itemId: { memberId: member.id, itemId: item.id } },
          select: { id: true, disabledAt: true },
        })

        if (!account || account.disabledAt) {
          /*
           * A password only so the account can be created at all.
           *
           * Ordinarily the portal sets the password somebody chose, so they can also
           * sign in directly. Nobody is choosing one here — an admin has no product
           * subscription and a re-provisioned customer is mid-click — and with the
           * handoff in place a password is not how either of them gets in. Random, and
           * deliberately never shown: whoever needs one can set it from the account page.
           */
          await syncProductAccess(member.id, {
            itemSlug: slug,
            password: randomBytes(24).toString('base64url'),
          })
          const after = await db.productAccount.findUnique({
            where: { memberId_itemId: { memberId: member.id, itemId: item.id } },
            select: { disabledAt: true },
          })
          hasAccount = Boolean(after && !after.disabledAt)
        } else {
          hasAccount = true
        }
      }
    }
  }

  const refusal = ssoRefusal({
    configured,
    signedIn: member !== null,
    entitled,
    hasAccount,
  })

  if (refusal) {
    return NextResponse.redirect(`${base}${refusalDestination(refusal, HERE)}`)
  }

  const session = await mintProductSession(member!.email)
  if (!session || !productUrl) {
    // Configured, entitled, provisioned — and it still did not work. That is ours, not
    // theirs, so it reads as "setting up" rather than as a refusal of their access.
    console.error('[sso] could not mint a session', { memberId: member!.id, slug })
    return NextResponse.redirect(`${base}${refusalDestination('no_account', HERE)}`)
  }

  return NextResponse.redirect(sessionRedirect(productUrl, session))
}
