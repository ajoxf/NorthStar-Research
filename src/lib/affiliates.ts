import type { AffiliateRewardKind } from '@prisma/client'

/**
 * Affiliate referrals.
 *
 * The shape of the deal, in one place:
 *
 *   - An affiliate has a slug. Their link is `{APP_BASE_URL}/join?ref=slug`.
 *   - Arriving with `?ref=` drops a cookie. Everything downstream — signup, payment —
 *     reads that cookie, so attribution survives the visitor wandering the site, closing
 *     the tab and coming back a week later.
 *   - A referral is credited when the visitor *pays*, never when they sign up. A free
 *     account is not a sale and paying for one would be an obvious thing to farm.
 *   - Awards are a ledger, appended once per conversion. **Nothing here pays anyone.**
 *     Payment happens outside the system and an operator marks the award settled; that
 *     is deliberate, not an omission.
 */

/** Attribution cookie. Read at signup and at payment, never trusted for anything else. */
export const REFERRAL_COOKIE = 'nsr_ref'

/**
 * How long an attribution lasts.
 *
 * Thirty days is the industry-standard window and it is a real trade-off, not a default:
 * longer credits an affiliate for a sale they arguably did not close, shorter loses them
 * sales they genuinely started. Changing it changes what partners are owed, so change it
 * deliberately.
 */
export const ATTRIBUTION_DAYS = 30

/**
 * Slugs are URL-safe, lowercase and stable.
 *
 * Stable matters more than pretty: a slug is printed in bios, videos and posts an
 * affiliate cannot edit, so it is never reused for a different affiliate even after one
 * is closed. The admin enforces uniqueness at the database level.
 */
export function normaliseSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}

export function referralLink(baseUrl: string, slug: string): string {
  return `${baseUrl.replace(/\/$/, '')}/join?ref=${encodeURIComponent(slug)}`
}

/**
 * What an affiliate earns on one conversion.
 *
 * Returns whole units: dollars for `percent` and `fixed`, months for `free_months`.
 * Percent is rounded **down** — over-paying an affiliate by a rounding error is a
 * reconciliation problem, and under-paying by a cent is not.
 */
export function awardFor(
  kind: AffiliateRewardKind,
  rewardAmount: number,
  paidAmountUsd: number,
): number {
  if (kind === 'percent') return Math.floor((paidAmountUsd * rewardAmount) / 100)
  if (kind === 'fixed') return rewardAmount
  return rewardAmount
}

export function describeReward(kind: AffiliateRewardKind, amount: number): string {
  if (kind === 'percent') return `${amount}% of the first payment`
  if (kind === 'fixed') return `$${amount} per conversion`
  return `${amount} free month${amount === 1 ? '' : 's'} per conversion`
}

/** Units an award is denominated in, for display. */
export function awardUnit(kind: AffiliateRewardKind): 'usd' | 'months' {
  return kind === 'free_months' ? 'months' : 'usd'
}

export function formatAward(kind: AffiliateRewardKind, amount: number): string {
  return awardUnit(kind) === 'usd'
    ? `$${amount.toLocaleString('en-US')}`
    : `${amount} month${amount === 1 ? '' : 's'}`
}
