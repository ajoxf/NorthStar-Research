import type { BillingIntervalValue } from '@/lib/package-shape'

/**
 * The rules of fulfilment that need no database: which lines an order has, and where a
 * new period starts. Tested directly (fulfilment-shape.test.ts); fulfilment.ts does the
 * reading and writing.
 */

export type LineKind = 'section' | 'package' | 'plan'

/** An order line as fulfilment needs it, whether stored or read off an older order. */
export type FulfilmentLine = {
  /** The stored OrderLine id. Null for an order placed before lines existed. */
  id: string | null
  kind: LineKind
  sectionId: string | null
  packageId: string | null
  /** Null on a line read off an older order: the caller looks the period up. */
  interval: BillingIntervalValue | null
}

/**
 * The lines of an order.
 *
 * Every order placed from now on stores its lines. Orders placed before lines existed
 * carried one thing on the order itself: a section, else a package, else the built-in
 * plan. Those are read as a single line, so fulfilment has one shape to deal with and an
 * old pending order that is paid tomorrow is granted exactly what it would have been.
 */
export function linesForOrder(order: {
  sectionId: string | null
  packageId: string | null
  lines: { id: string; kind: LineKind; sectionId: string | null; packageId: string | null; interval: BillingIntervalValue }[]
}): FulfilmentLine[] {
  if (order.lines.length > 0) {
    return order.lines.map((line) => ({
      id: line.id,
      kind: line.kind,
      sectionId: line.sectionId,
      packageId: line.packageId,
      interval: line.interval,
    }))
  }
  if (order.sectionId) {
    return [{ id: null, kind: 'section', sectionId: order.sectionId, packageId: null, interval: null }]
  }
  if (order.packageId) {
    return [{ id: null, kind: 'package', sectionId: null, packageId: order.packageId, interval: null }]
  }
  return [{ id: null, kind: 'plan', sectionId: null, packageId: null, interval: null }]
}

/**
 * Where a new period starts: now, or the end of the time already held if that is later.
 *
 * Paying early never costs the time somebody already has. A null end is "nothing held"
 * here, not "open-ended": an open-ended comp is never renewed by a payment in the first
 * place, because checkout refuses to sell something the buyer already holds.
 */
export function periodStart(now: Date, heldUntil: Date | null | undefined): Date {
  return heldUntil && heldUntil.getTime() > now.getTime() ? heldUntil : now
}

/** The latest of several end dates, ignoring the missing ones. */
export function latestEnd(dates: (Date | null | undefined)[]): Date | null {
  let latest: Date | null = null
  for (const date of dates) {
    if (date && (!latest || date.getTime() > latest.getTime())) latest = date
  }
  return latest
}

/**
 * Should this payment grant directly, or issue an access code?
 *
 * A code is how somebody without an account gets one: they redeem it and set a password.
 * Somebody who already has an account has nothing to activate, and handing them a code
 * they cannot use on the redeem page — it refuses an email that already has a password —
 * is how a card buyer with an account used to end up paying for a section they could not
 * open. They are granted on payment instead.
 */
export function fulfilmentRoute(member: { hasPassword: boolean } | null): 'grant' | 'code' {
  return member?.hasPassword ? 'grant' : 'code'
}
