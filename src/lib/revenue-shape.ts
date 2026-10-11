/**
 * Money in, net of what was never ours: tax belongs to the tax authority, and a refund
 * returns its share of the tax with it. Pure, so the overview's figures are tested.
 */

export type RevenueOrder = { grossCents: number; taxCents: number }
export type RevenueRefund = { amountCents: number; order: RevenueOrder }

export type RevenueSummary = {
  grossCents: number
  /** Tax collected, less the tax handed back with refunds. */
  taxCents: number
  refundedCents: number
  /** Gross less tax, less refunds net of their tax. */
  netCents: number
}

export function revenueSummary(orders: RevenueOrder[], refunds: RevenueRefund[]): RevenueSummary {
  const grossCents = orders.reduce((sum, order) => sum + order.grossCents, 0)
  const collected = orders.reduce((sum, order) => sum + order.taxCents, 0)
  const refundedCents = refunds.reduce((sum, refund) => sum + refund.amountCents, 0)
  // A partial refund takes back the same fraction of the order's tax.
  const refundedTax = refunds.reduce(
    (sum, refund) =>
      sum + (refund.order.grossCents > 0 ? Math.round((refund.amountCents * refund.order.taxCents) / refund.order.grossCents) : 0),
    0,
  )
  const taxCents = collected - refundedTax
  return { grossCents, taxCents, refundedCents, netCents: grossCents - collected - (refundedCents - refundedTax) }
}
