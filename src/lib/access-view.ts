/**
 * Describing who can read what, for the people who have to manage it.
 *
 * The access *rules* live in `entitlements.ts` and are not repeated here — this module
 * only answers the two questions an operator asks of a row they are looking at: where did
 * this access come from, and is it live. Keeping that apart from the rules matters,
 * because a description that drifted from the rule would be worse than no description:
 * it would be an admin screen confidently stating the opposite of what the site does.
 *
 * Pure and dependency-free, so both the member view and the section view can use it and
 * `node --test` can check it without a database.
 */

import { entitlementActive, isAllAccess, type MemberAccess } from '@/lib/entitlements'

/**
 * How somebody came to hold this.
 *
 * Not stored as a field: it is read back from which columns the granting path filled in,
 * because each path fills in a different set. Adding a column would mean every existing
 * row had a null in it, and the history an operator most needs to audit is exactly the
 * rows that predate the column.
 */
export type AccessSource = 'stripe' | 'crypto' | 'code' | 'manual'

export const ACCESS_SOURCE_LABEL: Record<AccessSource, string> = {
  stripe: 'Card',
  crypto: 'Crypto',
  code: 'Access code',
  manual: 'Granted by hand',
}

export type EntitlementRow = {
  status: string
  renewsAt: Date | null
  billingProvider: string | null
  stripeSubscriptionId: string | null
}

/**
 * Where this entitlement came from.
 *
 * A Stripe subscription id is the strongest signal and is checked first: it is written
 * only by the webhook, so its presence is proof rather than inference. `billingProvider`
 * alone means a payment settled without a stored mandate — crypto, which is renewed by
 * hand each period. A row with neither was written by the redemption path or by an
 * operator, and those two are told apart by whether anything is owed: a code grants a
 * period and so carries a renewal date; a comp granted by hand is open-ended.
 *
 * It is a best reading of the evidence, not a stored fact, and the admin says so rather
 * than presenting it as provenance.
 */
export function accessSource(entitlement: EntitlementRow): AccessSource {
  if (entitlement.stripeSubscriptionId) return 'stripe'
  if (entitlement.billingProvider === 'stripe') return 'stripe'
  if (entitlement.billingProvider === 'cregis') return 'crypto'
  if (entitlement.renewsAt === null) return 'manual'
  return 'code'
}

export type AccessState = 'live' | 'open-ended' | 'lapsed' | 'pending'

/**
 * What state this entitlement is in, in the words an operator would use.
 *
 * `open-ended` is split out from `live` deliberately. Both read, but they need different
 * attention: one will lapse on a date somebody can plan around, and the other never will
 * unless a person revokes it. Collapsing them into "active" is how a comp granted for a
 * fortnight in 2024 is still being honoured today with nobody aware of it.
 */
export function accessState(entitlement: EntitlementRow, now: Date = new Date()): AccessState {
  if (entitlement.status === 'pending') return 'pending'
  if (entitlementActive({ status: entitlement.status as never, renewsAt: entitlement.renewsAt }, now)) {
    return entitlement.renewsAt === null ? 'open-ended' : 'live'
  }
  return 'lapsed'
}

export const ACCESS_STATE_LABEL: Record<AccessState, string> = {
  live: 'Live',
  'open-ended': 'Open-ended',
  lapsed: 'Lapsed',
  pending: 'Pending',
}

/**
 * Days until this lapses. Null when there is nothing to count down to.
 *
 * Negative for something already past, because "lapsed 40 days ago" is a different
 * problem from "lapsed yesterday" and an operator triaging a list needs to see which.
 */
export function daysUntil(renewsAt: Date | null, now: Date = new Date()): number | null {
  if (renewsAt === null) return null
  return Math.ceil((renewsAt.getTime() - now.getTime()) / 86_400_000)
}

/**
 * The one sentence that has to sit at the top of a member's access panel.
 *
 * **This is the whole point of the screen.** `Member.subscriptionStatus` and the
 * entitlement rows are two different grants, and the admin has until now shown only the
 * first — as a green ACTIVE badge, on a list where it reads as "this person is paid up"
 * rather than as "this person can read the entire site regardless of what they bought".
 *
 * When all-access is on, the sections listed below are decoration: the member reads
 * everything whether or not any of them is live. Saying so out loud is the difference
 * between an operator who knows why somebody can open a report they never paid for and
 * one who thinks the access model is broken.
 */
export type AccessSummary = {
  allAccess: boolean
  /** Sections they hold in their own right, live or otherwise. */
  sectionCount: number
  liveSectionCount: number
  /** True when all-access is the only reason they can read anything. */
  allAccessIsLoadBearing: boolean
}

export function accessSummary(
  member: MemberAccess,
  entitlements: EntitlementRow[],
  now: Date = new Date(),
): AccessSummary {
  const allAccess = isAllAccess(member, now)
  const live = entitlements.filter((e) => accessState(e, now) === 'live' || accessState(e, now) === 'open-ended')
  return {
    allAccess,
    sectionCount: entitlements.length,
    liveSectionCount: live.length,
    allAccessIsLoadBearing: allAccess && live.length === 0,
  }
}
