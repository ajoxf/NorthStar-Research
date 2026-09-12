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
  | { kind: 'all_access'; interval: BillingIntervalValue; packageId: string | null; itemIds: string[] }
  | { kind: 'section'; interval: BillingIntervalValue; sectionId: string; itemIds: string[] }

/**
 * How many months of access a code hands over, or null for open-ended.
 *
 * Three cases, in the order an operator thinks about them:
 *
 *   1. The code was ticked open-ended — a comp. Null, and the entitlement gets no renewal
 *      date, which `entitlementActive` treats as live indefinitely.
 *   2. The code names a number of months. That wins over the package, which is the whole
 *      point of putting the period on the code: one "Nexus RAMP" package serves a paid
 *      subscription, a trial and a comp.
 *   3. The code says nothing — every code issued before this existed. Falls back to the
 *      package's own interval, so an outstanding code grants exactly what it granted the
 *      day it was sent. This is why null months is not "forever": that reading would have
 *      turned every code already in an inbox into a lifetime membership.
 */
export function monthsGranted(
  code: { grantsOpenEnded?: boolean | null; grantMonths?: number | null },
  packageInterval: BillingIntervalValue,
): number | null {
  if (code.grantsOpenEnded) return null
  return code.grantMonths ?? (packageInterval === 'year' ? 12 : 1)
}

/** `months` after `from`. Kept here so every period in this module is measured one way. */
export function addMonths(from: Date, months: number): Date {
  const end = new Date(from)
  end.setMonth(end.getMonth() + months)
  return end
}

/** What a redeemed code grants: a section when it names one, otherwise all-access. */
export function grantFor(
  code: { sectionId: string | null },
  fallback: { interval: BillingIntervalValue; packageId: string | null; itemIds?: string[] },
  section: { id: string; interval: BillingIntervalValue; itemId?: string | null } | null,
): Grant {
  if (code.sectionId && section) {
    return {
      kind: 'section',
      interval: section.interval,
      sectionId: section.id,
      // Empty until the backfill has given this section its item. An empty list grants no
      // entitlements by item, and the sectionId path below still grants the section — so a
      // half-migrated database hands over exactly what it did before items existed.
      itemIds: section.itemId ? [section.itemId] : [],
    }
  }
  // A code naming a section that has since been deleted would otherwise grant nothing at
  // all. Sections are never deleted, only archived, so this is defensive — but the safe
  // direction for a defensive branch is the one the buyer already had before sections.
  return {
    kind: 'all_access',
    interval: fallback.interval,
    packageId: fallback.packageId,
    // Whatever the package has ticked. This is the bundle: "Research + RAMP" is a package
    // with more items on it, not a different kind of grant.
    itemIds: fallback.itemIds ?? [],
  }
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
 * Where an entitlement's new period ends, given what the member already holds.
 *
 * Extends from the later of now and the current expiry, so somebody who renews a week
 * early keeps that week — the "any time left is added on top" promise in the renewal
 * email.
 *
 * ## Two things it must never do
 *
 * **Never shorten what somebody holds.** The previous version took the held renewal date
 * rather than the held row, which conflated two different situations: "no entitlement at
 * all" and "an entitlement with no end date". Both arrived as null, so a member with a
 * hand-granted open-ended comp who redeemed a one-month code had their comp quietly cut to
 * a month. Taking the row distinguishes them, and an open-ended entitlement now stays
 * open-ended whatever is redeemed against it.
 *
 * **An open-ended grant always wins.** A comp handed to somebody mid-subscription replaces
 * the date rather than being added to it. There is nothing to add a period to.
 */
export function extendedRenewal(
  held: { renewsAt: Date | null } | null,
  months: number | null,
  now: Date = new Date(),
): Date | null {
  // The grant is open-ended: no end date, whatever was there before.
  if (months === null) return null
  // Nothing held yet — the period runs from now.
  if (held === null) return addMonths(now, months)
  // Already open-ended. Adding months to "forever" would take time away.
  if (held.renewsAt === null) return null

  const base = held.renewsAt.getTime() > now.getTime() ? held.renewsAt : now
  return addMonths(base, months)
}
