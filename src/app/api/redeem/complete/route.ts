import { NextResponse } from 'next/server'
import { z } from 'zod'

import { emailSchema } from '@/lib/validation'

import { db } from '@/lib/db'
import { addPeriod, isFallbackPackage } from '@/lib/package-shape'
import { defaultPackage, packageById } from '@/lib/packages'
import { hashPassword, startSession } from '@/lib/auth'
import { safeNext } from '@/lib/oauth'
import { latestPublishedReport } from '@/lib/latest-report'
import { isCodeExpired, normaliseCode } from '@/lib/codes'
import { resolveContactNumbers } from '@/lib/contact-numbers'
import { recordReferralSignup, referralSlugFromCookie } from '@/lib/referral-attribution'
import { appBaseUrl } from '@/lib/env'
import { getNotificationProvider } from '@/lib/notifications'

export const runtime = 'nodejs'

const schema = z.object({
  /** Where to land after activating. Same-origin paths only — see safeNext. */
  next: z.string().nullable().optional(),
  code: z.string().min(4),
  email: emailSchema,
  password: z.string().min(10, 'Use at least 10 characters.'),
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  /*
   * Required at sign-up.
   *
   * It is a contact detail, not a delivery channel — reports go by email only. The desk
   * needs a way to reach a paying member that does not depend on an email landing in a
   * spam folder, and asking later means never getting it.
   *
   * Redemption is the one point every member passes through, whichever way they arrived
   * — card, crypto, gifted code or referral — so it is the only place a number can be
   * asked for once and captured from everybody.
   */
  phoneNumber: z
    // `required_error` matters: a *missing* field never reaches .min(), so without this
    // an omitted number is reported to the member as the bare word "Required".
    .string({ required_error: 'Enter your mobile number, including the country code.' })
    .trim()
    .min(6, 'Enter your mobile number, including the country code.')
    .max(32, 'That number is too long.'),
  /** False when they run WhatsApp on a different line. Defaults to the common case. */
  whatsappSameAsPhone: z.boolean().default(true),
  whatsappNumber: z.string().trim().max(32, 'That number is too long.').optional(),
})

/**
 * Step 2 of the redemption wizard: claim the code and activate the membership.
 *
 * The whole thing runs in one transaction with a conditional update on the code row, so
 * two people racing the same code cannot both end up with a subscription.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the details you entered.' },
      { status: 400 },
    )
  }

  const code = normaliseCode(parsed.data.code)
  const email = parsed.data.email
  const numbers = resolveContactNumbers({
    phoneNumber: parsed.data.phoneNumber,
    whatsappSameAsPhone: parsed.data.whatsappSameAsPhone,
    whatsappNumber: parsed.data.whatsappNumber,
  })

  const existing = await db.member.findUnique({ where: { email } })
  if (existing?.passwordHash) {
    return NextResponse.json(
      { error: 'An account already exists for that email address. Sign in instead.' },
      { status: 409 },
    )
  }

  const passwordHash = await hashPassword(parsed.data.password)

  // Which membership this code grants, read before the claim below. The code's package
  // never changes, so reading it outside the transaction races with nothing — and a
  // gifted code, which carries none, falls back to whatever is currently on sale.
  const codePackage = await db.redemptionCode.findUnique({
    where: { code },
    select: { packageId: true },
  })
  const chosen = codePackage?.packageId ? await packageById(codePackage.packageId) : null
  const pkg = chosen ?? (await defaultPackage())
  const packageId = isFallbackPackage(pkg) ? null : pkg.id

  try {
    const member = await db.$transaction(async (tx) => {
      // Conditional on status *and* expiry, both inside the transaction: the update
      // touches 0 rows if someone else just claimed it, or if it lapsed between the
      // validate call and this one. The email is written here rather than only onto the
      // Member, so every activation is traceable from the code row itself.
      const claimedAt = new Date()
      const claimed = await tx.redemptionCode.updateMany({
        where: {
          code,
          status: 'unused',
          OR: [{ expiresAt: null }, { expiresAt: { gt: claimedAt } }],
        },
        data: { status: 'redeemed', redeemedAt: claimedAt, redeemedEmail: email },
      })

      if (claimed.count === 0) {
        // Distinguish the two so the person is told something they can act on.
        const current = await tx.redemptionCode.findUnique({ where: { code } })
        throw new RedemptionError(
          current && current.status === 'unused' && isCodeExpired(current, claimedAt)
            ? 'This code has expired. Contact support and we will issue you a new one.'
            : 'That code is no longer valid. It may have already been used.',
        )
      }

      const now = new Date()
      // First paid period starts now. Stripe members then have this extended
      // automatically by each `invoice.paid`; Cregis members extend it by paying again.
      const renewsAt = addPeriod(pkg.interval, now)

      const created = await tx.member.upsert({
        where: { email },
        create: {
          email,
          passwordHash,
          firstName: parsed.data.firstName || null,
          lastName: parsed.data.lastName || null,
          phoneNumber: numbers.phoneNumber,
          whatsappNumber: numbers.whatsappNumber,
          whatsappOptIn: numbers.whatsappOptIn,
          role: 'member',
          subscriptionStatus: 'active',
          subscriptionStartedAt: now,
          subscriptionRenewsAt: renewsAt,
          billingProvider: 'cregis',
          source: 'cregis_checkout',
          packageId,
        },
        update: {
          passwordHash,
          firstName: parsed.data.firstName || undefined,
          lastName: parsed.data.lastName || undefined,
          phoneNumber: numbers.phoneNumber ?? undefined,
          whatsappNumber: numbers.whatsappNumber ?? undefined,
          whatsappOptIn: numbers.whatsappOptIn || undefined,
          subscriptionStatus: 'active',
          subscriptionStartedAt: now,
          subscriptionRenewsAt: renewsAt,
          packageId: packageId ?? undefined,
        },
      })

      await tx.redemptionCode.update({
        where: { code },
        data: { redeemedByMemberId: created.id },
      })

      return created
    })

    // After the transaction, and never inside it: neither attribution nor a welcome
    // email may roll back a membership somebody has paid for.
    await recordReferralSignup(referralSlugFromCookie(), email, member.id)

    // The welcome fires here rather than from the payment webhooks because this is the
    // one point every route converges on — card, crypto, and gifted or referral codes.
    // Sending it from the webhooks would greet buyers and silently skip everybody who
    // arrived on a code.
    try {
      const result = await getNotificationProvider().sendWelcomeEmail(
        { email, firstName: member.firstName },
        `${appBaseUrl()}/dashboard`,
        // Something to read immediately. A member who joins between editions would
        // otherwise wait days for their first email with a report in it, having just
        // paid for research that is already sitting there.
        await latestPublishedReport(),
      )
      if (result.status === 'failed') {
        console.error(`[redeem] welcome email failed for ${email}: ${result.error}`)
      }
    } catch (error) {
      // A membership that is active must not be reported as failed because a welcome
      // could not be sent. The member is in; the greeting is not load-bearing.
      console.error('[redeem] welcome email threw', error)
    }

    await startSession(member)
    return NextResponse.json({ ok: true, redirectTo: safeNext(parsed.data.next) ?? '/dashboard' })
  } catch (error) {
    if (error instanceof RedemptionError) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('[redeem] failed', error)
    return NextResponse.json(
      { error: 'We could not activate your membership. Please contact support.' },
      { status: 500 },
    )
  }
}

class RedemptionError extends Error {}
