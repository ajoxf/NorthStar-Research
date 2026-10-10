import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { commissionCents, commissionClawback, earnsCommission } from '@/lib/commission-shape'

describe('commissionCents', () => {
  it('takes a percentage of what was paid, rounded down', () => {
    assert.equal(commissionCents({ rewardKind: 'percent', rewardAmount: 20 }, 44820), 8964)
    assert.equal(commissionCents({ rewardKind: 'percent', rewardAmount: 15 }, 7920), 1188)
    assert.equal(commissionCents({ rewardKind: 'percent', rewardAmount: 33 }, 101), 33)
  })
  it('pays a fixed reward per order, never more than was paid', () => {
    assert.equal(commissionCents({ rewardKind: 'fixed', rewardAmount: 25 }, 9900), 2500)
    assert.equal(commissionCents({ rewardKind: 'fixed', rewardAmount: 25 }, 1000), 1000)
  })
  it('pays no cash for free months, or on nothing paid', () => {
    assert.equal(commissionCents({ rewardKind: 'free_months', rewardAmount: 1 }, 9900), 0)
    assert.equal(commissionCents({ rewardKind: 'percent', rewardAmount: 20 }, 0), 0)
  })
})

describe('earnsCommission', () => {
  it('pays the first order only on first-payment terms', () => {
    assert.equal(earnsCommission('first_payment', 0), true)
    assert.equal(earnsCommission('first_payment', 1), false)
  })
  it('pays every order on every-payment terms', () => {
    assert.equal(earnsCommission('every_payment', 5), true)
  })
})

describe('commissionClawback', () => {
  it('takes back the refunded share, and all of it on a full refund', () => {
    assert.equal(commissionClawback({ commissionCents: 2000, grossCents: 10000, refundedAfterCents: 5000, reversedSoFarCents: 0 }), 1000)
    assert.equal(commissionClawback({ commissionCents: 2000, grossCents: 10000, refundedAfterCents: 10000, reversedSoFarCents: 1000 }), 1000)
  })
  it('never takes back more than was paid', () => {
    let reversed = 0
    for (const after of [333, 666, 999]) {
      reversed += commissionClawback({ commissionCents: 101, grossCents: 999, refundedAfterCents: after, reversedSoFarCents: reversed })
    }
    assert.equal(reversed, 101)
  })
})
