import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  apportion,
  refundPlan,
  refundedByPortion,
  refundedFromPortion,
  portionsByAuthor,
  DEFAULT_HOLDBACK_DAYS,
  balanceOf,
  earningFor,
  netRevenueCents,
  payableAt,
  reversalCents,
  splitNet,
  withdrawable,
  type OrderFinancials,
} from '@/lib/earnings'

const order = (over: Partial<OrderFinancials> = {}): OrderFinancials => ({
  grossCents: 26_175,
  taxCents: 0,
  gatewayFeeCents: 0,
  ibFeeCents: 0,
  ...over,
})

describe('netRevenueCents', () => {
  it('is the gross when nothing has been deducted', () => {
    // Which is today's reality: tax and fee capture are not wired up, so net equals gross
    // and the split is of the whole amount.
    assert.equal(netRevenueCents(order()), 26_175)
  })

  it('takes tax off, because tax was never revenue', () => {
    // Money collected for a tax authority is held, not earned. Sharing it would pay out a
    // slice of a liability.
    assert.equal(netRevenueCents(order({ taxCents: 4_363 })), 21_812)
  })

  it('takes the processor and the introducing broker off the top', () => {
    const net = netRevenueCents(
      order({ taxCents: 4_363, gatewayFeeCents: 262, ibFeeCents: 4_310 }),
    )
    assert.equal(net, 26_175 - 4_363 - 262 - 4_310)
  })

  it('never goes below zero', () => {
    /*
     * A sale whose fees exceeded its revenue is a loss the platform absorbs, not a debt the
     * instructor owes. A negative earning would net off against unrelated sales in the
     * balance, turning one bad order into a silent deduction from other work.
     */
    assert.equal(netRevenueCents(order({ grossCents: 1_000, gatewayFeeCents: 5_000 })), 0)
  })
})

describe('splitNet', () => {
  it('splits evenly at fifty percent', () => {
    assert.deepEqual(splitNet(20_000, 50), { authorCents: 10_000, platformCents: 10_000 })
  })

  it('honours a contract that is not fifty', () => {
    // Dean's 70/30.
    assert.deepEqual(splitNet(20_000, 70), { authorCents: 14_000, platformCents: 6_000 })
  })

  it('always sums to the net exactly, whatever the rounding', () => {
    /*
     * The property the whole ledger rests on. Rounding both halves independently loses or
     * invents a cent per sale — on an odd number at 50/50, both halves round the same way —
     * and a ledger that does not reconcile is worth nothing however close it is.
     */
    for (const net of [1, 3, 99, 101, 26_175, 21_813, 999_999]) {
      for (const pct of [1, 33, 50, 70, 99, 100]) {
        const split = splitNet(net, pct)
        assert.equal(
          split.authorCents + split.platformCents,
          net,
          `${pct}% of ${net} did not reconcile`,
        )
        assert.ok(Number.isInteger(split.authorCents))
        assert.ok(Number.isInteger(split.platformCents))
      }
    }
  })

  it('gives the instructor nothing at zero and everything at a hundred', () => {
    assert.equal(splitNet(20_000, 0).authorCents, 0)
    assert.equal(splitNet(20_000, 100).platformCents, 0)
  })

  it('clamps a percentage outside the range rather than inverting the split', () => {
    // A stored rate outside 0–100 is a bug; one that handed the instructor more than the
    // whole sale, or the platform a negative, would be a worse one.
    assert.equal(splitNet(20_000, 150).authorCents, 20_000)
    assert.equal(splitNet(20_000, -10).authorCents, 0)
  })
})

describe('earningFor — the worked example', () => {
  it('matches the figure quoted for fees off the top', () => {
    /*
     * $349 at 25% off, 20% tax inside the price, 1% processor, 20% IB, split 50/50.
     * This is the number an instructor will be shown, so it is pinned to a test rather
     * than left to whoever next edits the arithmetic.
     */
    const result = earningFor(
      { grossCents: 26_175, taxCents: 4_363, gatewayFeeCents: 262, ibFeeCents: 4_310 },
      50,
    )
    assert.equal(result.netCents, 17_240)
    assert.equal(result.authorCents, 8_620)
    assert.equal(result.platformCents, 8_620)
  })

  it('pays Dean seventy percent of the same sale', () => {
    const result = earningFor({ grossCents: 19_900, taxCents: 0, gatewayFeeCents: 0, ibFeeCents: 0 }, 70)
    assert.equal(result.authorCents, 13_930)
    assert.equal(result.platformCents, 5_970)
  })
})

describe('payableAt', () => {
  it('counts from when the payment cleared, not from now', () => {
    // A sale posted late by a retried webhook must not restart somebody's clock.
    const paid = new Date('2026-03-01T00:00:00Z')
    assert.equal(
      payableAt(paid, 30).toISOString(),
      new Date('2026-03-31T00:00:00Z').toISOString(),
    )
  })

  it('uses thirty days unless told otherwise', () => {
    const paid = new Date('2026-03-01T00:00:00Z')
    assert.equal(payableAt(paid).getTime(), payableAt(paid, DEFAULT_HOLDBACK_DAYS).getTime())
  })

  it('is immediate with no holdback', () => {
    const paid = new Date('2026-03-01T00:00:00Z')
    assert.equal(payableAt(paid, 0).getTime(), paid.getTime())
  })
})

describe('reversalCents', () => {
  const original = { authorCents: 8_620, grossCents: 26_175 }

  it('cancels the original exactly on a full refund', () => {
    /*
     * Exact, with no rounding anywhere in the path. If a full refund left a cent behind,
     * every refunded sale would leave a residue on the ledger and the balance would drift
     * away from the truth one cent at a time.
     */
    assert.equal(reversalCents(original, 26_175), -8_620)
  })

  it('takes back a proportional share of a partial refund', () => {
    assert.equal(reversalCents(original, 13_088), -Math.round((8_620 * 13_088) / 26_175))
  })

  it('scales the original rather than recomputing from today’s terms', () => {
    /*
     * The case that would quietly overpay or overcharge. Recomputing would apply today's
     * share percentage and today's fees to a sale made under last quarter's terms, so an
     * instructor whose rate had improved would hand back more than they were ever given.
     */
    const generous = { authorCents: 18_000, grossCents: 26_175 }
    assert.equal(reversalCents(generous, 26_175), -18_000)
  })

  it('never takes back more than was given', () => {
    // A refund recorded for more than the order — a typo, or a refund entered twice.
    assert.equal(reversalCents(original, 999_999), -8_620)
  })

  it('is nothing for a refund of nothing, or against an order of nothing', () => {
    assert.equal(reversalCents(original, 0), 0)
    assert.equal(reversalCents({ authorCents: 0, grossCents: 0 }, 5_000), 0)
  })
})

describe('balanceOf', () => {
  const now = new Date('2026-04-01T00:00:00Z')
  const past = new Date('2026-03-01T00:00:00Z')
  const future = new Date('2026-05-01T00:00:00Z')

  it('separates what is earned from what can be paid', () => {
    const balance = balanceOf(
      [
        { amountCents: 10_000, payableAt: past },
        { amountCents: 5_000, payableAt: future },
      ],
      now,
    )
    assert.deepEqual(balance, { totalCents: 15_000, availableCents: 10_000, heldCents: 5_000 })
  })

  it('counts an entry with no holdback as available at once', () => {
    /*
     * Payouts, reversals and manual adjustments carry no holdback. A reversal that waited
     * thirty days to apply would leave a balance claiming money refunded weeks earlier —
     * which is precisely the balance somebody would withdraw against.
     */
    const balance = balanceOf(
      [
        { amountCents: 10_000, payableAt: past },
        { amountCents: -4_000, payableAt: null },
      ],
      now,
    )
    assert.equal(balance.availableCents, 6_000)
  })

  it('becomes available the moment the holdback ends', () => {
    assert.equal(balanceOf([{ amountCents: 100, payableAt: now }], now).availableCents, 100)
  })

  it('is zero for a contributor with no entries', () => {
    assert.deepEqual(balanceOf([], now), { totalCents: 0, availableCents: 0, heldCents: 0 })
  })

  it('can go negative when refunds outrun earnings', () => {
    // A real state, not an error: it is a debt, and the ledger has to be able to say so.
    const balance = balanceOf([{ amountCents: 1_000, payableAt: past }, { amountCents: -3_000, payableAt: null }], now)
    assert.equal(balance.totalCents, -2_000)
  })
})

describe('withdrawable', () => {
  const balance = { totalCents: 15_000, availableCents: 10_000, heldCents: 5_000 }

  it('allows an amount inside the available balance', () => {
    assert.deepEqual(withdrawable(balance, 10_000), { ok: true })
  })

  it('refuses money that is still inside the holdback', () => {
    // The point of the holdback: that money may yet be refunded, and paying it out turns a
    // clawback into a debt to chase rather than an entry to write.
    const result = withdrawable(balance, 12_000)
    assert.equal(result.ok, false)
    assert.match(result.ok === false ? result.reason : '', /holdback/)
  })

  it('says something different when there is simply nothing there', () => {
    const empty = { totalCents: 0, availableCents: 0, heldCents: 0 }
    const result = withdrawable(empty, 100)
    assert.equal(result.ok, false)
    assert.match(result.ok === false ? result.reason : '', /has earned/)
  })

  it('refuses zero and negative amounts', () => {
    assert.equal(withdrawable(balance, 0).ok, false)
    assert.equal(withdrawable(balance, -500).ok, false)
  })
})

describe('apportion', () => {
  it('always sums to the total', () => {
    for (const [total, weights] of [[100, [1, 1, 1]], [1, [3, 3]], [999, [99, 349, 7]], [0, [1, 2]]] as const) {
      const shares = apportion(total, [...weights])
      assert.equal(shares.reduce((a, b) => a + b, 0), total)
    }
  })
  it('splits in proportion', () => {
    assert.deepEqual(apportion(448, [99, 349]), [99, 349])
    assert.deepEqual(apportion(100, [1, 3]), [25, 75])
  })
  it('splits nothing across zero weights', () => {
    assert.deepEqual(apportion(50, [0, 0]), [0, 0])
  })
})

describe('portionsByAuthor', () => {
  it('shares order-wide fees by line value and groups by author', () => {
    const portions = portionsByAuthor(
      [
        { authorId: 'sarah', chargeCents: 10000 },
        { authorId: 'dean', chargeCents: 30000 },
        { authorId: 'sarah', chargeCents: 10000 },
      ],
      { taxCents: 0, gatewayFeeCents: 1000, ibFeeCents: 0 },
    )
    const sarah = portions.find((p) => p.authorId === 'sarah')!
    const dean = portions.find((p) => p.authorId === 'dean')!
    assert.deepEqual([sarah.grossCents, sarah.netCents], [20000, 19600])
    assert.deepEqual([dean.grossCents, dean.netCents], [30000, 29400])
  })
  it('keeps house lines as their own portion', () => {
    const portions = portionsByAuthor([{ authorId: null, chargeCents: 19900 }], { taxCents: 0, gatewayFeeCents: 0, ibFeeCents: 0 })
    assert.deepEqual(portions, [{ authorId: null, grossCents: 19900, netCents: 19900 }])
  })
})

describe('refundPlan', () => {
  // A cart: Sarah's $100 line earned her $50; Dean's $300 line earned him $150.
  const portions = [
    { authorId: 'sarah', grossCents: 10000, earningCents: 5000 },
    { authorId: 'dean', grossCents: 30000, earningCents: 15000 },
  ]
  const fresh = { refundedCents: [0, 0], reversedCents: [0, 0] }

  it("refunding one expert's line takes back only their share", () => {
    assert.deepEqual(refundPlan(portions, 10000, 'sarah', fresh), [{ authorId: 'sarah', reversalCents: -5000 }])
  })

  it('refunding the whole order shares it by what is unrefunded', () => {
    assert.deepEqual(refundPlan(portions, 20000, null, fresh), [
      { authorId: 'sarah', reversalCents: -2500 },
      { authorId: 'dean', reversalCents: -7500 },
    ])
  })

  it('a later whole-order refund falls on the parts that are left', () => {
    // Sarah's line already refunded in full and her $50 reversed.
    const history = { refundedCents: [10000, 0], reversedCents: [5000, 0] }
    assert.deepEqual(refundPlan(portions, 30000, null, history), [{ authorId: 'dean', reversalCents: -15000 }])
  })

  it('never takes more than was earned, and a full refund cancels exactly', () => {
    const odd = [{ authorId: 'x', grossCents: 999, earningCents: 333 }]
    let history = { refundedCents: [0], reversedCents: [0] }
    let total = 0
    for (const part of [333, 333, 333]) {
      const [entry] = refundPlan(odd, part, null, history)
      total += -entry.reversalCents
      history = { refundedCents: [history.refundedCents[0] + part], reversedCents: [total] }
    }
    assert.equal(total, 333)
  })

  it('takes nothing from house revenue', () => {
    const withHouse = [...portions, { authorId: null, grossCents: 19900, earningCents: null }]
    assert.equal(refundPlan(withHouse, 19900, null, { refundedCents: [0, 0, 0], reversedCents: [0, 0, 0] }).length, 2)
  })
})

describe('refundedByPortion', () => {
  const portions = [
    { authorId: 'sarah', grossCents: 10000, earningCents: 5000 },
    { authorId: 'dean', grossCents: 30000, earningCents: 15000 },
  ]
  it('replays scoped and whole-order refunds in order', () => {
    const refunds = [
      { amountCents: 10000, authorId: 'sarah' },
      { amountCents: 6000, authorId: null },
    ]
    // Sarah is already fully refunded, so the whole-order refund lands on Dean.
    assert.deepEqual(refundedByPortion(portions, refunds), [10000, 6000])
    assert.equal(refundedFromPortion(portions, 'dean', refunds), 6000)
  })
})
