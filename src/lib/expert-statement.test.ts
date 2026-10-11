import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { periodStart, summariseByPeriod, totalsByProduct, type StatementEntry } from '@/lib/expert-statement'

const at = (iso: string) => new Date(iso)
const earning = (iso: string, gross: number, net: number, share: number, products = [{ key: 'a', weight: gross }]): StatementEntry => ({
  kind: 'earning',
  amountCents: share,
  at: at(iso),
  grossCents: gross,
  netCents: net,
  products,
})

describe('periodStart', () => {
  it('starts weeks on Monday and months on the 1st, in UTC', () => {
    assert.equal(periodStart(at('2026-10-11T23:00:00Z'), 'week').toISOString(), '2026-10-05T00:00:00.000Z')
    assert.equal(periodStart(at('2026-10-05T00:00:00Z'), 'week').toISOString(), '2026-10-05T00:00:00.000Z')
    assert.equal(periodStart(at('2026-10-31T23:59:59Z'), 'month').toISOString(), '2026-10-01T00:00:00.000Z')
  })
})

describe('summariseByPeriod', () => {
  const now = at('2026-10-10T12:00:00Z')

  it('totals earnings and refunds into the period they happened in', () => {
    const [october, september] = summariseByPeriod(
      [
        earning('2026-10-02T10:00:00Z', 9900, 9000, 4500),
        earning('2026-10-09T10:00:00Z', 34900, 31000, 15500),
        { kind: 'reversal', amountCents: -4500, at: at('2026-10-03T00:00:00Z'), products: [] },
        earning('2026-09-15T10:00:00Z', 9900, 9900, 4950),
      ],
      'month',
      3,
      now,
    )
    assert.deepEqual(
      { key: october.key, payments: october.payments, gross: october.grossCents, deductions: october.deductionsCents, net: october.netCents, share: october.shareCents, back: october.takenBackCents },
      { key: '2026-10', payments: 2, gross: 44800, deductions: 4800, net: 40000, share: 20000, back: 4500 },
    )
    assert.equal(september.key, '2026-09')
    assert.equal(september.shareCents, 4950)
  })

  it('keeps empty periods and drops entries older than the window', () => {
    const weeks = summariseByPeriod([earning('2026-01-05T10:00:00Z', 100, 100, 50)], 'week', 4, now)
    assert.equal(weeks.length, 4)
    assert.deepEqual(weeks.map((w) => w.key), ['2026-10-05', '2026-09-28', '2026-09-21', '2026-09-14'])
    assert.ok(weeks.every((w) => w.payments === 0 && w.shareCents === 0))
  })
})

describe('totalsByProduct', () => {
  it('splits an entry across products by what each was charged, to the cent', () => {
    const totals = totalsByProduct([
      earning('2026-10-02T10:00:00Z', 44800, 44800, 22401, [
        { key: 'a', weight: 9900 },
        { key: 'b', weight: 34900 },
      ]),
      { kind: 'reversal', amountCents: -22401, at: at('2026-10-03T00:00:00Z'), products: [{ key: 'b', weight: 1 }] },
    ])
    const a = totals.find((t) => t.key === 'a')!
    const b = totals.find((t) => t.key === 'b')!
    assert.equal(a.shareCents + b.shareCents, 22401)
    assert.equal(a.shareCents, 4950)
    assert.equal(b.takenBackCents, 22401)
    assert.equal(a.payments, 1)
  })

  it('splits evenly when nothing was charged', () => {
    const [first, second] = totalsByProduct([
      earning('2026-10-02T10:00:00Z', 0, 0, 0, [
        { key: 'a', weight: 0 },
        { key: 'b', weight: 0 },
      ]),
    ])
    assert.equal(first.payments + second.payments, 2)
  })
})
