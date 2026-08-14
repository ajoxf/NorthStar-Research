import 'server-only'

import { cookies } from 'next/headers'

import { REFERRAL_COOKIE, awardFor, normaliseSlug } from '@/lib/affiliates'
import { db } from '@/lib/db'

/**
 * Turning a referral into money owed.
 *
 * Called from the two places a sale actually completes — the Cregis callback and the
 * Stripe webhook — and from redemption, which is where a person first gets a name.
 *
 * Three rules this enforces, all of which exist because affiliate programmes are farmed:
 *
 *   1. **Only a payment converts.** A signup is recorded, but it earns nothing. Paying
 *      for signups is paying for email addresses.
 *   2. **One award per referral.** The ledger is checked before writing, so a webhook
 *      redelivery — which Stripe and Cregis both do — cannot pay twice.
 *   3. **Never throws into the caller.** A payment must not fail because attribution
 *      did. The money is real; the credit is bookkeeping and can be repaired by hand.
 */

/** The affiliate slug this visitor is attributed to, if any. */
export function referralSlugFromCookie(): string | null {
  const value = cookies().get(REFERRAL_COOKIE)?.value
  const slug = normaliseSlug(value ?? '')
  return slug || null
}

/**
 * Record that a referred visitor became a member. Earns nothing on its own.
 *
 * Attaches to the most recent unclaimed click from that affiliate where there is one, so
 * the funnel reads as one journey rather than a click and an unrelated signup.
 */
export async function recordReferralSignup(slug: string | null, email: string, memberId: string) {
  if (!slug) return

  try {
    const affiliate = await db.affiliate.findUnique({ where: { slug } })
    if (!affiliate || affiliate.status === 'closed') return

    const existing = await db.referral.findFirst({
      where: { affiliateId: affiliate.id, status: 'visited', email: null },
      orderBy: { visitedAt: 'desc' },
    })

    if (existing) {
      await db.referral.update({
        where: { id: existing.id },
        data: { status: 'signed_up', email, memberId, signedUpAt: new Date() },
      })
      return
    }

    await db.referral.create({
      data: {
        affiliateId: affiliate.id,
        status: 'signed_up',
        email,
        memberId,
        signedUpAt: new Date(),
      },
    })
  } catch (error) {
    console.error('[referral] could not record signup', error)
  }
}

/**
 * Record a paid conversion and write the affiliate's award.
 *
 * `email` identifies the referral to convert, so this works from a webhook that has no
 * cookie to read — by the time money moves, the browser that clicked the link is long
 * gone and may not be the one that paid.
 */
export async function recordReferralConversion(email: string, amountUsd: number) {
  try {
    const referral = await db.referral.findFirst({
      where: { email, status: { in: ['visited', 'signed_up'] } },
      orderBy: { visitedAt: 'desc' },
      include: { affiliate: true },
    })
    if (!referral) return

    // Paused and closed affiliates stop earning. Their history is untouched.
    if (referral.affiliate.status !== 'active') return

    const alreadyAwarded = await db.affiliateAward.findFirst({
      where: { referralId: referral.id },
    })
    if (alreadyAwarded) return

    const amount = awardFor(
      referral.affiliate.rewardKind,
      referral.affiliate.rewardAmount,
      amountUsd,
    )

    await db.$transaction([
      db.referral.update({
        where: { id: referral.id },
        data: { status: 'converted', convertedAt: new Date(), amountUsd },
      }),
      db.affiliateAward.create({
        data: {
          affiliateId: referral.affiliate.id,
          referralId: referral.id,
          kind: referral.affiliate.rewardKind,
          amount,
          reason: `Conversion — ${email}`,
        },
      }),
    ])
  } catch (error) {
    // See rule 3 above: the payment stands regardless.
    console.error('[referral] could not record conversion', error)
  }
}
