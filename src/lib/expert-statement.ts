/**
 * An expert's sales, as totals by period — never as payments.
 *
 * The expert portal shows what was sold, what came off it, and what the expert's share
 * was, week by week and month by month. It deliberately has no per-payment rows: on a
 * small section, a row with a date and an amount is enough to recognise a buyer, and the
 * expert must never be able to tell who their subscribers are. Pure, so the grouping and
 * the arithmetic are tested without a database.
 */

import { apportion } from '@/lib/earnings'

export type StatementEntry = {
  kind: 'earning' | 'reversal'
  /** Signed: an earning is positive, a refund's reversal negative. */
  amountCents: number
  /** When the money moved: the payment, or the refund. */
  at: Date
  /** The expert's part of what the buyer was charged. Earnings only. */
  grossCents?: number | null
  /** That, less tax, gateway fee and affiliate commission — what the share was taken of. */
  netCents?: number | null
  /** What the entry was for, weighted by what each was charged, to total by product. */
  products: { key: string; weight: number }[]
}

export type Period = {
  key: string
  start: Date
  /** Payments the expert earned on. A count, never a list. */
  payments: number
  grossCents: number
  deductionsCents: number
  netCents: number
  shareCents: number
  /** Share taken back by refunds in the period, as a positive number. */
  takenBackCents: number
}

export type ProductTotal = { key: string; payments: number; shareCents: number; takenBackCents: number }

const DAY_MS = 86_400_000

/** The start of the period holding `date`: the 1st of the month, or Monday, in UTC. */
export function periodStart(date: Date, unit: 'week' | 'month'): Date {
  if (unit === 'month') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const sinceMonday = (day.getUTCDay() + 6) % 7
  return new Date(day.getTime() - sinceMonday * DAY_MS)
}

function previous(start: Date, unit: 'week' | 'month'): Date {
  return unit === 'month'
    ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1))
    : new Date(start.getTime() - 7 * DAY_MS)
}

/**
 * The last `count` periods, newest first, empty ones included — a gap in the table would
 * read as a missing week rather than a quiet one. Entries older than the window are left
 * out; the balance, not this table, is the all-time figure.
 */
export function summariseByPeriod(
  entries: StatementEntry[],
  unit: 'week' | 'month',
  count: number,
  now: Date = new Date(),
): Period[] {
  const periods: Period[] = []
  let start = periodStart(now, unit)
  for (let i = 0; i < count; i += 1) {
    periods.push({
      key: start.toISOString().slice(0, unit === 'month' ? 7 : 10),
      start,
      payments: 0,
      grossCents: 0,
      deductionsCents: 0,
      netCents: 0,
      shareCents: 0,
      takenBackCents: 0,
    })
    start = previous(start, unit)
  }
  const byKey = new Map(periods.map((period) => [period.start.getTime(), period]))

  for (const entry of entries) {
    const period = byKey.get(periodStart(entry.at, unit).getTime())
    if (!period) continue
    if (entry.kind === 'earning') {
      const gross = entry.grossCents ?? entry.netCents ?? 0
      const net = entry.netCents ?? gross
      period.payments += 1
      period.grossCents += gross
      period.netCents += net
      period.deductionsCents += Math.max(0, gross - net)
      period.shareCents += entry.amountCents
    } else {
      period.takenBackCents += -entry.amountCents
    }
  }
  return periods
}

/**
 * All-time totals per product. An entry covering several of the expert's products — a cart
 * holding two of their sections — is split by what each was charged, to the cent.
 */
export function totalsByProduct(entries: StatementEntry[]): ProductTotal[] {
  const totals = new Map<string, ProductTotal>()
  const get = (key: string) => {
    const current = totals.get(key) ?? { key, payments: 0, shareCents: 0, takenBackCents: 0 }
    totals.set(key, current)
    return current
  }
  for (const entry of entries) {
    if (entry.products.length === 0) continue
    const weights = entry.products.map((product) => product.weight)
    // Nothing charged on any of them (a free first payment): split evenly instead.
    const parts = apportion(Math.abs(entry.amountCents), weights.some((w) => w > 0) ? weights : weights.map(() => 1))
    entry.products.forEach((product, index) => {
      const total = get(product.key)
      if (entry.kind === 'earning') {
        total.payments += 1
        total.shareCents += parts[index]
      } else {
        total.takenBackCents += parts[index]
      }
    })
  }
  return [...totals.values()].sort((a, b) => b.shareCents - a.shareCents)
}
