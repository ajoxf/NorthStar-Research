/**
 * A free trial of the research membership itself.
 *
 * Separate from the product trials next door, and the separation is the point.
 *
 * A product trial writes one `Entitlement` row and nothing else. That cannot express this
 * one: the research membership is not an `Item`, it is two columns on `Member` left from
 * when all-access was the only thing sold, and every member on the site today holds it
 * that way. So there is nothing for an entitlement to point at.
 *
 * `trial-shape.ts` carries a rule saying a trial must NEVER write those columns. It was
 * written to stop a trial of a piece of software quietly becoming a free month of the
 * research archive, and it is still right about that. This is the other case, stated
 * explicitly rather than by exception: a trial OF the research, where handing over the
 * research is the whole point of it.
 *
 * Pure — no database, no `server-only` — so the rules about who may have one can be read
 * and tested without either.
 */

/**
 * The reserved handle for this offer.
 *
 * It is not an item and there is no row with this slug. It travels through the same
 * `?item=` parameter and the same signup form as a real one, so the shape of a trial link
 * is identical whichever kind it names, and nothing downstream needs a second code path
 * to carry it.
 */
export const RESEARCH_TRIAL_SLUG = 'nordstar-research'

/** What it is called wherever an offer is named. */
export const RESEARCH_TRIAL_NAME = 'NordStar Pro research'

export const RESEARCH_TRIAL_ENABLED_KEY = 'trial.research.enabled'
export const RESEARCH_TRIAL_DAYS_KEY = 'trial.research.days'

export type ResearchTrialRefusal = 'disabled' | 'already_trialled' | 'already_a_member'

/**
 * What this account holds today, as far as this decision is concerned.
 *
 * `subscriptionStatus` of `pending` is the never-had-a-membership state: it is the default
 * on a new row and it is what a product trialist has, since a product trial deliberately
 * leaves these columns alone. Anything else means a membership exists or once did.
 */
export type ResearchTrialEligibility = {
  enabled: boolean
  subscriptionStatus: string
  /** Set the first time a research trial is granted, and never cleared. */
  researchTrialStartedAt: Date | null
}

/**
 * May this account start a research trial?
 *
 * Two refusals, and they are different things said to different people:
 *
 *   - `already_trialled` — they have had their free fortnight. Judged on the marker
 *     having a value rather than on the status, so an expired trial still counts. Judged
 *     on the status instead, the same account takes a free fortnight every month simply
 *     by waiting for the last one to lapse.
 *   - `already_a_member` — they hold a membership, or held one and let it lapse. A
 *     current member does not need a trial of the thing they are paying for, and a lapsed
 *     one asking for a free fortnight is asking for a discount on a renewal.
 *
 * Order matters: somebody who trialled and then subscribed is told they are a member,
 * which is the more useful of the two true answers.
 */
export function researchTrialRefusal(
  input: ResearchTrialEligibility,
): ResearchTrialRefusal | null {
  if (!input.enabled) return 'disabled'
  if (input.subscriptionStatus !== 'pending') return 'already_a_member'
  if (input.researchTrialStartedAt !== null) return 'already_trialled'
  return null
}

/** What to tell somebody, in their terms rather than ours. */
export function researchTrialRefusalMessage(refusal: ResearchTrialRefusal): string {
  switch (refusal) {
    case 'disabled':
      return 'Free trials are not open at the moment.'
    case 'already_trialled':
      return 'This account has already had a trial. Get in touch and we will sort you out.'
    case 'already_a_member':
      return 'This account already has a membership. Sign in to read.'
  }
}
