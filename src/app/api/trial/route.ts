import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentMember, hashPassword, startSession } from '@/lib/auth'
import { db } from '@/lib/db'
import { syncProductAccess } from '@/lib/product-auth'
import { refusalMessage, trialEndsAt, trialRefusal, trialSettings } from '@/lib/trial'

/**
 * Start a free trial.
 *
 * Two ways in, one outcome:
 *
 *   - **Signed out**, with an email and a password: an account is created and the trial
 *     granted. This is the distribution path — no code to ask for, nothing to wait on.
 *   - **Signed in**, with no body at all: the trial is granted to whoever is signed in.
 *     Without this an existing member who never bought this product would have nowhere to
 *     go: their email already has an account, so the first path refuses them.
 *
 * What it writes is one Entitlement row. Not the subscription columns on Member — those
 * are the legacy all-access membership, and a trial of a piece of software is not a free
 * month of the research archive. See the note at the top of lib/trial.ts.
 */

const Body = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(8, 'Use at least 8 characters.'),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
})

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(request: Request) {
  const settings = await trialSettings()

  // Read before anything is written, so a refusal cannot leave half an account behind.
  const item = await db.item.findUnique({
    where: { slug: settings.itemSlug },
    select: { id: true, name: true, archivedAt: true },
  })
  const itemExists = Boolean(item && !item.archivedAt)

  const signedIn = await getCurrentMember()

  /*
   * Has this account ever held this item?
   *
   * Ever, not currently: an expired trial still counts, or the trial renews itself every
   * month for anyone willing to wait. Checked before the account is created for a signed
   * out request, by email, so signing up again with the same address is refused too.
   */
  const existing = signedIn ?? null
  let heldEver = false
  if (existing && item) {
    heldEver =
      (await db.entitlement.count({ where: { memberId: existing.id, itemId: item.id } })) > 0
  }

  // Signed out: everything hangs off the email, so parse the body first.
  let email = existing?.email ?? ''
  let parsed: z.infer<typeof Body> | null = null

  if (!existing) {
    const body = await request.json().catch(() => null)
    const result = Body.safeParse(body)
    if (!result.success) {
      return fail(result.error.issues[0]?.message ?? 'Check the form and try again.')
    }
    parsed = result.data
    email = parsed.email.trim().toLowerCase()

    const already = await db.member.findUnique({
      where: { email },
      select: { id: true, passwordHash: true },
    })
    if (already) {
      // Never silently overwrite a password, and never reveal more than the person asking
      // already knows: whoever holds this address can find out by signing in.
      return fail('That email already has an account. Sign in and start your trial from there.', 409)
    }
  }

  const refusal = trialRefusal({ enabled: settings.enabled, itemExists, heldEver })
  if (refusal) return fail(refusalMessage(refusal), refusal === 'already_trialled' ? 409 : 403)
  if (!item) return fail(refusalMessage('no_item'), 403)

  const now = new Date()
  const endsAt = trialEndsAt(settings.days, now)

  const member = existing
    ? existing
    : await db.member.create({
        data: {
          email,
          passwordHash: await hashPassword(parsed!.password),
          firstName: parsed!.firstName || null,
          lastName: parsed!.lastName || null,
          role: 'member',
          // Deliberately absent: subscriptionStatus, subscriptionRenewsAt, packageId.
          // A trialist is not a member of the research desk.
          source: 'trial',
        },
      })

  /*
   * The trial itself.
   *
   * `create`, not an upsert: the eligibility check above has already established that this
   * member holds no entitlement to this item, and the unique key on (memberId, itemId)
   * makes a race lose loudly rather than quietly extending somebody's access.
   */
  try {
    await db.entitlement.create({
      data: {
        memberId: member.id,
        itemId: item.id,
        status: 'active',
        startedAt: now,
        renewsAt: endsAt,
      },
    })
  } catch {
    return fail(refusalMessage('already_trialled'), 409)
  }

  /*
   * Open the door the trial just paid for.
   *
   * The product has its own sign-in, so an entitlement here is not on its own something
   * anybody can log into. This creates the account there with the password they chose a
   * moment ago — the same credentials, both sites.
   *
   * Deliberately not awaited into the response's success: it never throws, and a trial
   * that was granted is granted whether or not the product's auth system answered. The
   * nightly job reconciles, and the outcome is returned for the logs.
   */
  const access = await syncProductAccess(member.id, { password: parsed?.password ?? null })

  if (!existing) await startSession(member)

  return NextResponse.json({
    access: access.action,
    ok: true,
    item: item.name,
    days: settings.days,
    endsAt: endsAt.toISOString(),
  })
}
