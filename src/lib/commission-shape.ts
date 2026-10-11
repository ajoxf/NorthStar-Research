/**
 * Affiliate commission, the parts that need no database. Tested directly
 * (commission-shape.test.ts); affiliate-commission.ts reads and writes.
 */

export type CommissionTerms = {
  rewardKind: 'percent' | 'fixed' | 'free_months'
  /** A percentage for `percent`, whole dollars for `fixed`, months for `free_months`. */
  rewardAmount: number
  commissionOn: 'first_payment' | 'every_payment'
}

/**
 * The cash commission on one paid order, in cents.
 *
 * A percentage of what the buyer actually paid — after any discount, because that is the
 * figure the affiliate can check against a price they can see — rounded down, so the
 * platform never pays a fraction of a cent it did not take. A fixed reward is per paying
 * order. Free months are not cash and are granted separately.
 */
export function commissionCents(terms: Pick<CommissionTerms, 'rewardKind' | 'rewardAmount'>, paidCents: number): number {
  if (paidCents <= 0) return 0
  if (terms.rewardKind === 'percent') {
    const pct = Math.min(100, Math.max(0, terms.rewardAmount))
    return Math.floor((paidCents * pct) / 100)
  }
  if (terms.rewardKind === 'fixed') return Math.min(paidCents, Math.max(0, terms.rewardAmount) * 100)
  return 0
}

/**
 * Does this payment earn commission?
 *
 * On `first_payment` terms, only a buyer's first commissioned order with this affiliate
 * earns; on `every_payment`, each one does, renewals included.
 */
export function earnsCommission(scope: CommissionTerms['commissionOn'], earlierCommissionedOrders: number): boolean {
  return scope === 'every_payment' || earlierCommissionedOrders === 0
}

/**
 * How much commission a refund takes back, sized against a running total.
 *
 * Once a fraction f of the order has been refunded the affiliate has given back
 * round(f × commission) in all; this refund takes the difference from what earlier ones
 * already took. A full refund therefore cancels the commission exactly, and rounding can
 * never take back more than was paid.
 */
export function commissionClawback(input: {
  commissionCents: number
  grossCents: number
  refundedAfterCents: number
  reversedSoFarCents: number
}): number {
  if (input.grossCents <= 0 || input.commissionCents <= 0) return 0
  const target =
    input.refundedAfterCents >= input.grossCents
      ? input.commissionCents
      : Math.round((input.commissionCents * Math.max(0, input.refundedAfterCents)) / input.grossCents)
  return Math.max(0, Math.min(target, input.commissionCents) - input.reversedSoFarCents)
}

/** What a master partner earns on a sub-affiliate's sale when no rate is set for that sub. */
export const SUB_AFFILIATE_OVERRIDE_PERCENT = 5

/**
 * A master partner's override on a sale their sub-affiliate introduced: a percent of the
 * sale before tax, paid on top of the sub's own commission — never out of it. Only a sale
 * that earned the sub cash earns an override, so a free-months reward or a first-payment-
 * only term that has run out earns the master nothing either.
 */
export function overrideCents(input: { paidCents: number; subCommissionCents: number; percent: number | null }): number {
  if (input.paidCents <= 0 || input.subCommissionCents <= 0) return 0
  const pct = Math.min(100, Math.max(0, input.percent ?? SUB_AFFILIATE_OVERRIDE_PERCENT))
  return Math.floor((input.paidCents * pct) / 100)
}
