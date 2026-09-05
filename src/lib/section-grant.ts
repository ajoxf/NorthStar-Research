/**
 * What redeeming a code actually grants.
 *
 * Every route into a membership converges on redemption — card, crypto, a gifted code,
 * a referral — so this is the one place that decides whether somebody ends up with
 * all-access or with a single section. Getting it wrong in the generous direction hands
 * the whole archive to a $49 buyer; getting it wrong in the other locks out somebody who
 * has paid. Both are worth a pure function and a test rather than a branch buried in a
 * transaction.
 *
 * ## The rule that matters
 *
 * **A section code must never write the subscription fields on Member.**
 *
 * `Member.subscriptionStatus` / `subscriptionRenewsAt` *are* the legacy all-access
 * membership — `isAllAccess` reads them and returns true before entitlements are even
 * consulted. Setting them for a section buyer would silently grant them everything the
 * desk has ever published. So a section grant writes an `Entitlement` row and leaves
 * those columns alone, in both directions: it does not set them for a new member, and it
 * does not disturb them for an existing all-access member adding a section.
 */

export type BillingIntervalValue = 'month' | 'year'

export type Grant =
  | { kind: 'all_access'; interval: BillingIntervalValue; packageId: string | null }
  | { kind: 'section'; interval: BillingIntervalValue; sectionId: string }

/** What a redeemed code grants: a section when it names one, otherwise all-access. */
export function grantFor(
  code: { sectionId: string | null },
  fallback: { interval: BillingIntervalValue; packageId: string | null },
  section: { id: string; interval: BillingIntervalValue } | null,
): Grant {
  if (code.sectionId && section) {
    return { kind: 'section', interval: section.interval, sectionId: section.id }
  }
  // A code naming a section that has since been deleted would otherwise grant nothing at
  // all. Sections are never deleted, only archived, so this is defensive — but the safe
  // direction for a defensive branch is the one the buyer already had before sections.
  return { kind: 'all_access', interval: fallback.interval, packageId: fallback.packageId }
}

/**
 * The Member columns a grant may write.
 *
 * Empty for a section grant. That emptiness is the whole safety property of this module:
 * see the note at the top.
 */
export function memberSubscriptionFields(
  grant: Grant,
  now: Date,
  renewsAt: Date,
): {
  subscriptionStatus?: 'active'
  subscriptionStartedAt?: Date
  subscriptionRenewsAt?: Date
  packageId?: string | null
} {
  if (grant.kind === 'section') return {}
  return {
    subscriptionStatus: 'active',
    subscriptionStartedAt: now,
    subscriptionRenewsAt: renewsAt,
    packageId: grant.packageId,
  }
}

/**
 * What to write to Entitlement, or null when the grant is all-access.
 *
 * Renewing an existing entitlement updates the row rather than adding a second — the
 * unique key on (memberId, sectionId) enforces that, and the renewal date moves forward
 * from whichever is later, now or the current one, so re-redeeming early never shortens
 * what somebody has.
 */
export function entitlementFields(
  grant: Grant,
  now: Date,
  renewsAt: Date,
): { sectionId: string; status: 'active'; startedAt: Date; renewsAt: Date } | null {
  if (grant.kind !== 'section') return null
  return { sectionId: grant.sectionId, status: 'active', startedAt: now, renewsAt }
}

/**
 * Where an entitlement's new period ends, given what it already has.
 *
 * Extends from the later of now and the current expiry, so somebody who renews a week
 * early keeps that week. Identical in spirit to how a code extension works, and to the
 * "any time left is added on top" promise in the renewal email.
 */
export function extendedRenewal(
  current: Date | null,
  addPeriod: (from: Date) => Date,
  now: Date = new Date(),
): Date {
  const base = current !== null && current.getTime() > now.getTime() ? current : now
  return addPeriod(base)
}
