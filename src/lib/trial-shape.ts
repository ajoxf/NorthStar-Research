/**
 * Free trials: what they grant, for how long, and who may have one.
 *
 * A trial is not a new kind of access. It is an entitlement to an item with an end date,
 * exactly like a paid month or a three-month code — which is why nothing downstream of
 * this file knows trials exist. `hasItem` lets somebody in or does not; it has no opinion
 * about how they came by the entitlement.
 *
 * ## The rule that keeps this from being expensive
 *
 * **A trial must never write the subscription columns on Member.**
 *
 * `Member.subscriptionStatus` / `subscriptionRenewsAt` *are* the legacy all-access
 * membership. Setting them for a trialist would hand them the desk's entire research
 * archive, free, for a fortnight — which is not what a trial of a piece of software is.
 * The trial writes an Entitlement row and nothing else, and the test suite says so.
 *
 * ## What this deliberately does not do
 *
 * No card is taken, so nothing here can stop somebody signing up again next month with a
 * different address. What it does stop is the same *account* trialling twice: one trial
 * per member per item, checked against the entitlement rows that already exist. Tightening
 * that further — a verified email, a card on file — is a commercial decision rather than a
 * technical one, and the place to make it is here.
 *
 * The rules live in this file and the stored settings in `trial.ts`, because anything that
 * imports `server-only` cannot be unit tested — the same split as `package-shape.ts`.
 */

export const TRIAL_ENABLED_KEY = 'trial.enabled'
export const TRIAL_DAYS_KEY = 'trial.days'
export const TRIAL_ITEM_KEY = 'trial.itemSlug'
/**
 * Set once, when the single global trial is carried onto the item it named.
 *
 * Its own flag rather than inferring from the item columns: "no item has trials on" is
 * also the ordinary state of having closed the last one, and reading that as "not migrated
 * yet" would re-open a trial every time an operator turned one off.
 */
export const TRIAL_MIGRATED_KEY = 'trial.migratedToItems'

/** What a trial grants when nobody has said otherwise. */
export const TRIAL_DEFAULTS = { days: 14, itemSlug: 'nexus-ramp' } as const

export type TrialSettings = {
  /** Off until somebody turns it on. See below. */
  enabled: boolean
  days: number
  itemSlug: string
}

/**
 * A stored day count, made safe.
 *
 * Anything unreadable falls back to the default rather than to zero: a setting somebody
 * fat-fingered should give the normal trial, not an expired one. Clamped at both ends
 * because a negative trial is nonsense and a thousand-day one is a comp that nobody meant
 * to grant.
 */
export function parseDays(raw: string | null | undefined): number {
  const parsed = Number(raw)
  if (!raw || !Number.isFinite(parsed)) return TRIAL_DEFAULTS.days
  return clampDays(parsed)
}

export function clampDays(days: number): number {
  return Math.min(365, Math.max(1, Math.round(days)))
}

/** When a trial started now runs out. */
export function trialEndsAt(days: number, from: Date = new Date()): Date {
  const end = new Date(from)
  end.setDate(end.getDate() + clampDays(days))
  return end
}

export type TrialRefusal = 'disabled' | 'already_trialled' | 'no_item'

/**
 * May this account start a trial of this item?
 *
 * Pure, so the rule can be read and tested without a database. The caller supplies what it
 * found; this decides.
 *
 * "Already trialled" is judged on whether an entitlement to the item has EVER existed for
 * the member, not on whether one is live. An expired trial still counts — otherwise the
 * trial renews itself every month for anyone patient enough to wait. A current paying
 * customer is refused for the same reason and it reads correctly: they do not need one.
 */
export function trialRefusal(input: {
  enabled: boolean
  itemExists: boolean
  heldEver: boolean
}): TrialRefusal | null {
  if (!input.enabled) return 'disabled'
  if (!input.itemExists) return 'no_item'
  if (input.heldEver) return 'already_trialled'
  return null
}

/** What to tell somebody, in their terms rather than ours. */
export function refusalMessage(refusal: TrialRefusal): string {
  switch (refusal) {
    case 'disabled':
      return 'Free trials are not open at the moment.'
    case 'already_trialled':
      return 'This account has already had a trial. Get in touch and we will sort you out.'
    case 'no_item':
      return 'Free trials are not open at the moment.'
  }
}
