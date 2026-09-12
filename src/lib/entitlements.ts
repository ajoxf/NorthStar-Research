/**
 * Who can read what.
 *
 * The product used to have one answer to that question — you are a member or you are not
 * — and every gate in the app asked it as a boolean. Sections make it a question about a
 * *particular report*, because somebody who bought "Energy by Sarah Chen" is a paying
 * member who must not be shown Tom's indices work.
 *
 * ## The property that makes this safe to deploy to a live site
 *
 * **A member with no entitlements behaves exactly as they did before this file existed.**
 *
 * Every member on nordstarpro.com today holds the legacy all-access membership, recorded
 * in `Member.subscriptionStatus` / `subscriptionRenewsAt`, and holds no `Entitlement`
 * rows at all. `isAllAccess` reads those two fields with the same logic the old
 * `hasActiveSubscription` used, and it is checked *first* — so for every current member
 * every function here short-circuits to "yes" before entitlements are consulted. Nobody's
 * access can change on the deploy that introduces this, because for them nothing here
 * runs any new logic.
 *
 * That is also why the legacy fields are not migrated into `Entitlement` rows. A data
 * migration over live paying members, to reach a state the code already handles, would be
 * risk taken for nothing.
 *
 * ## The rule
 *
 *   1. Admins read everything.
 *   2. An active legacy membership reads everything — that is what all-access means, and
 *      it is what these members bought.
 *   3. A report with no section is all-access only. Every report published before sections
 *      existed is in this group, and a single-section buyer has not paid for the desk's
 *      whole back catalogue.
 *   4. Otherwise: an active entitlement for that report's section, or nothing.
 *
 * Nothing here consults the sections feature flag. Access is always evaluated this way,
 * whether or not sections are on sale — a flag that could change who may read a report
 * would be a flag that could open the archive by accident.
 */

/** The legacy all-access membership, as recorded on Member. */
export type MemberAccess = {
  role: string
  subscriptionStatus: string
  subscriptionRenewsAt: Date | null
}

export type EntitlementAccess = {
  /**
   * Null once the column is retired, and null in the meantime for any row that grants a
   * product rather than a section. Every function here treats a null section as granting
   * no reports, which is exactly right: a RAMP entitlement is not a claim on the archive.
   */
  sectionId: string | null
  /** Set by the backfill and on every new write. See {@link ItemEntitlement}. */
  itemId?: string | null
  status: string
  /** End of the paid period. Null is open-ended — a comp granted by hand. */
  renewsAt: Date | null
}

/**
 * An entitlement as it is once items exist: it points at an item, whatever kind that is.
 *
 * `sectionId` is still here because the column is still there — every row written before
 * the backfill has one, and rows written during it have both. Once nothing reads
 * `sectionId` the column goes and this type loses a field.
 */
export type ItemEntitlement = {
  itemId: string | null
  sectionId?: string | null
  status: string
  /** End of the paid period. Null is open-ended — a comp granted by hand. */
  renewsAt: Date | null
}

/**
 * Is this one section entitlement live right now?
 *
 * Mirrors the legacy rule exactly, including the open-ended case: a null renewal date is
 * a comp that does not lapse, not a missing value to treat as expired. Getting that
 * backwards would silently cut off every hand-granted member.
 */
export function entitlementActive(
  entitlement: Pick<EntitlementAccess, 'status' | 'renewsAt'>,
  now: Date = new Date(),
): boolean {
  if (entitlement.status !== 'active') return false
  if (!entitlement.renewsAt) return true
  return entitlement.renewsAt.getTime() > now.getTime()
}

/**
 * Does this member hold the legacy all-access membership?
 *
 * Byte-for-byte the old `hasActiveSubscription` rule. It is repeated here rather than
 * imported because `@/lib/auth` pulls in `server-only`, and this module has to stay
 * testable — but the two must not drift, and a test asserts they agree.
 */
export function isAllAccess(member: MemberAccess, now: Date = new Date()): boolean {
  if (member.role === 'admin') return true
  if (member.subscriptionStatus !== 'active') return false
  if (!member.subscriptionRenewsAt) return true
  return member.subscriptionRenewsAt.getTime() > now.getTime()
}

/**
 * Can this member see the portal at all?
 *
 * True for all-access members and for anyone holding at least one live section. This is
 * the gate for the shell, the dashboard and the tools — not for any individual report.
 *
 * **A section, specifically.** An entitlement with a null section grants a product, not
 * the desk's writing, and the portal this gates is the research portal. Counting one here
 * would let a Nexus RAMP trialist through the archive door — to an empty room, because
 * `canReadReport` and `reportVisibilityWhere` both exclude null sections, but standing in
 * an empty archive being told their membership is active is not what they signed up for,
 * and a gate that is only saved by the gate behind it is one change away from a leak.
 */
export function hasAnyAccess(
  member: MemberAccess,
  entitlements: EntitlementAccess[],
  now: Date = new Date(),
): boolean {
  if (isAllAccess(member, now)) return true
  return entitlements.some(
    (entitlement) => entitlement.sectionId !== null && entitlementActive(entitlement, now),
  )
}

/**
 * Can this member read this particular report?
 *
 * The only question that matters at a report gate, and the one the old boolean could not
 * answer.
 */
export function canReadReport(
  member: MemberAccess,
  report: { sectionId: string | null },
  entitlements: EntitlementAccess[],
  now: Date = new Date(),
): boolean {
  if (isAllAccess(member, now)) return true

  // An untagged report belongs to the all-access catalogue. Returning true here would
  // hand the entire pre-sections archive to anyone who bought a single section for a
  // month, which is the most expensive mistake available in this file.
  if (report.sectionId === null) return false

  return entitlements.some(
    (entitlement) =>
      entitlement.sectionId === report.sectionId && entitlementActive(entitlement, now),
  )
}

/**
 * The sections this member may read, for use as a query filter.
 *
 * Returns null for an all-access member, meaning "do not filter" — distinct from an empty
 * array, which means "this member may read nothing". Collapsing those two into one empty
 * list is how a filter accidentally shows everybody everything, so they are different
 * types and every caller has to handle both.
 */
export function readableSectionIds(
  member: MemberAccess,
  entitlements: EntitlementAccess[],
  now: Date = new Date(),
): string[] | null {
  if (isAllAccess(member, now)) return null
  return entitlements
    .filter((entitlement) => entitlement.sectionId !== null && entitlementActive(entitlement, now))
    .map((entitlement) => entitlement.sectionId as string)
}

/**
 * A Prisma `where` fragment restricting reports to what this member may read.
 *
 * Spread into an existing where clause. An all-access member contributes nothing, so the
 * query is unchanged; a section member is restricted to their own sections and, because
 * `sectionId: { in: [...] }` never matches null, is excluded from untagged reports without
 * that having to be said separately.
 */
export function reportVisibilityWhere(
  member: MemberAccess,
  entitlements: EntitlementAccess[],
  now: Date = new Date(),
): { sectionId?: { in: string[] } } {
  const ids = readableSectionIds(member, entitlements, now)
  if (ids === null) return {}
  return { sectionId: { in: ids } }
}

/**
 * Does this member hold this item right now?
 *
 * The one question the whole system asks. A research section, Nexus RAMP, the fifth
 * product — same call, same answer, no per-product branch anywhere else.
 *
 * ## The rule that is deliberately NOT here
 *
 * `isAllAccess` is not consulted, and that is the point. Every research member on the site
 * today holds the legacy all-access membership, and all-access means the desk's writing —
 * the thing they paid for. If this function short-circuited on it the way `canReadReport`
 * does, the deploy that introduced products would hand Nexus RAMP, free and instantly, to
 * every research subscriber. The one short-circuit kept is for admins, who need to be able
 * to open a product to support someone using it.
 *
 * So: research keeps its legacy rule, in the functions above, untouched. Items are earned
 * one at a time, by an entitlement somebody was actually granted.
 */
export function hasItem(
  member: MemberAccess,
  entitlements: ItemEntitlement[],
  itemId: string,
  now: Date = new Date(),
): boolean {
  if (member.role === 'admin') return true
  return entitlements.some(
    (entitlement) => entitlement.itemId === itemId && entitlementActive(entitlement, now),
  )
}

/**
 * The items this member holds live entitlements to.
 *
 * For the member dashboard, which needs to show what somebody has rather than ask about
 * one thing at a time. Unlike `readableSectionIds` there is no null case: an all-access
 * membership is not a claim on every item, for the reason set out above.
 */
export function heldItemIds(
  entitlements: ItemEntitlement[],
  now: Date = new Date(),
): string[] {
  return entitlements
    .filter((entitlement) => entitlement.itemId !== null && entitlementActive(entitlement, now))
    .map((entitlement) => entitlement.itemId as string)
}

/**
 * When access granted by this code should end, given the code and the package behind it.
 *
 * Three cases, in the order an operator thinks about them:
 *
 *   1. The code says open-ended — a comp. No renewal date, and `entitlementActive` treats
 *      that as live forever, the same as a hand-granted section today.
 *   2. The code names a number of months — "three months", a fortnight's trial expressed
 *      as a month. Counted from redemption, not from minting: a code sitting in an inbox
 *      is not burning the period somebody paid for.
 *   3. The code says nothing, which is every code issued before this existed. Falls back
 *      to the package's own interval, so an outstanding code grants exactly what it
 *      granted the day it was sent.
 */
export function grantEndsAt(
  code: { grantsOpenEnded: boolean; grantMonths: number | null },
  packageInterval: 'month' | 'year',
  redeemedAt: Date = new Date(),
): Date | null {
  if (code.grantsOpenEnded) return null

  const months = code.grantMonths ?? (packageInterval === 'year' ? 12 : 1)
  const end = new Date(redeemedAt)
  end.setMonth(end.getMonth() + months)
  return end
}
