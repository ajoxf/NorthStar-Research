import type { BillingIntervalValue } from '@/lib/package-shape'

/**
 * What a refund does to access. Pure, so it is tested directly
 * (refund-access-shape.test.ts); refund-access.ts reads and writes.
 */

/** One billing period earlier. The inverse of addPeriod. */
export function periodBack(date: Date, interval: BillingIntervalValue): Date {
  const earlier = new Date(date)
  if (interval === 'year') earlier.setFullYear(earlier.getFullYear() - 1)
  else earlier.setMonth(earlier.getMonth() - 1)
  return earlier
}

/**
 * Take back the period a refunded payment bought.
 *
 * Access is the paid period stacked on whatever was held before, so the refund removes
 * exactly one period from the end. For a first purchase that lands at or before now, and
 * access ends today. For a crypto renewal stacked on time already paid for, the member
 * keeps the earlier period they did not get back. An open-ended row (a comp) has no end
 * to move and is left alone: a refund cannot take back something that was never sold.
 */
export function rollBackAccess(
  renewsAt: Date | null,
  interval: BillingIntervalValue,
  now: Date,
): { status: 'active' | 'expired'; renewsAt: Date | null } | null {
  if (renewsAt === null) return null
  const earlier = periodBack(renewsAt, interval)
  return earlier.getTime() > now.getTime()
    ? { status: 'active', renewsAt: earlier }
    : { status: 'expired', renewsAt: now }
}

/**
 * The parts of an order that this refund has just refunded in full.
 *
 * Only those — a part already fully refunded by an earlier refund has had its access
 * taken back once, and taking it back twice would remove a period the member did pay for.
 * Partial refunds end nothing: a goodwill amount is not a cancellation.
 */
export function partsCompleted<T extends { grossCents: number }>(
  portions: T[],
  refundedBefore: number[],
  refundedAfter: number[],
): T[] {
  return portions.filter(
    (portion, index) =>
      portion.grossCents > 0 && refundedBefore[index] < portion.grossCents && refundedAfter[index] >= portion.grossCents,
  )
}
