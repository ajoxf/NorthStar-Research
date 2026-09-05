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
  sectionId: string
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
 */
export function hasAnyAccess(
  member: MemberAccess,
  entitlements: EntitlementAccess[],
  now: Date = new Date(),
): boolean {
  if (isAllAccess(member, now)) return true
  return entitlements.some((entitlement) => entitlementActive(entitlement, now))
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
    .filter((entitlement) => entitlementActive(entitlement, now))
    .map((entitlement) => entitlement.sectionId)
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
