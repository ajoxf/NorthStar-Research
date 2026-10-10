import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
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
