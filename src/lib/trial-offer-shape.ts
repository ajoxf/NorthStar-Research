/**
 * Whether an offer is on the shelf at all.
 *
 * Pure, so both rules can be tested without a database — the same split as
 * `trial-shape.ts`, and for the same reason: anything importing `server-only`
 * cannot be unit tested.
 */

export type ItemKind = 'section' | 'product'

/**
 * Is the offer's item actually available?
 *
 * A research section carries its own `archivedAt` alongside the item's. They are separate
 * columns and either one being set means the offer is off the shelf — a live trial of a
 * section that has been retired would admit somebody to an archive nobody is writing.
 *
 * This lived in three places at once: the signup page, the public status endpoint, and
 * the chrome around it. Three copies of one rule is three chances
 * for them to disagree about whether an offer exists, so there is now one.
 */
export function offerUsable(item: {
  archivedAt: Date | null
  kind: ItemKind
  section: { archivedAt: Date | null } | null
} | null | undefined): boolean {
  if (!item || item.archivedAt) return false
  if (item.kind !== 'section') return true
  return Boolean(item.section && !item.section.archivedAt)
}


/**
 * Is a trial of this item open, and for how long?
 *
 * Pure. The caller supplies the item's own two columns and the house default; this decides.
 *
 * Per item, because one global "what is on trial" could only ever describe a single offer
 * — switching a trial on for a second product closed the first, silently, and the customer
 * evaluating the first found out by being refused.
 *
 * `trialDays` null means "use the house default", so the default is a real lever: change
 * it and every item that never had a number of its own moves with it. A number set on the
 * item wins, and is clamped, because a stored 0 or 10000 is somebody's typo rather than a
 * decision.
 */
export function itemTrial(
  item:
    | {
        trialEnabled: boolean
        trialDays: number | null
        archivedAt: Date | null
        kind: ItemKind
        section: { archivedAt: Date | null } | null
      }
    | null
    | undefined,
  defaultDays: number,
): { days: number } | null {
  if (!item || !item.trialEnabled) return null
  if (!offerUsable(item)) return null
  return { days: clampTrialDays(item.trialDays ?? defaultDays) }
}

/**
 * A day count made safe.
 *
 * Duplicated from trial-shape's clampDays rather than imported, to keep this file's
 * dependencies at zero — the same reason the file exists. Both clamp to the same range and
 * a test holds them to it.
 */
export function clampTrialDays(days: number): number {
  if (!Number.isFinite(days)) return 14
  return Math.min(365, Math.max(1, Math.round(days)))
}
