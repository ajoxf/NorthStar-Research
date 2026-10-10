import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { dedupeItems, groupByInterval, priceCart } from '@/lib/cart-shape'
import type { OfferShape } from '@/lib/offer'

function offer(id: string, percentOff: number, scope: Partial<OfferShape>): OfferShape {
  return {
    id, name: id, code: null, percentOff, duration: 'first_payment', startsAt: null, endsAt: null,
    maxRedemptions: null, redeemedCount: 0, appliesToEverything: false, sectionIds: [], packageIds: [],
    ...scope,
  } as OfferShape
}

const a = { target: { sectionId: 'a' }, listCents: 10000 }
const b = { target: { sectionId: 'b' }, listCents: 30000 }

describe('priceCart', () => {
  it('charges list price with no offer', () => {
    const cart = priceCart([a, b], [])
    assert.equal(cart.chargeCents, 40000)
    assert.equal(cart.offer, null)
  })

  it('applies one offer to every line it covers, and only those', () => {
    const cart = priceCart([a, b], [offer('o1', 20, { sectionIds: ['a'] })])
    assert.deepEqual(cart.lines.map((line) => line.chargeCents), [8000, 30000])
    assert.deepEqual(cart.lines.map((line) => line.offerId), ['o1', null])
    assert.equal(cart.chargeCents, 38000)
  })

  it('picks the offer that saves most across the basket, not the highest percentage', () => {
    // 50% off the $100 line saves $50; 25% off the $300 line saves $75.
    const cart = priceCart([a, b], [offer('deep', 50, { sectionIds: ['a'] }), offer('wide', 25, { sectionIds: ['b'] })])
    assert.equal(cart.offer?.id, 'wide')
    assert.equal(cart.chargeCents, 10000 + 22500)
  })

  it('never stacks two offers', () => {
    const cart = priceCart([a, b], [offer('x', 10, { sectionIds: ['a'] }), offer('y', 10, { sectionIds: ['b'] })])
    assert.equal(cart.lines.filter((line) => line.offerId !== null).length, 1)
  })

  it('treats an everything offer as covering every line', () => {
    const cart = priceCart([a, b], [offer('all', 10, { appliesToEverything: true })])
    assert.equal(cart.chargeCents, 36000)
  })
})

describe('groupByInterval', () => {
  it('splits monthly from yearly, monthly first', () => {
    const groups = groupByInterval([
      { id: 'y', interval: 'year' as const },
      { id: 'm', interval: 'month' as const },
    ])
    assert.deepEqual(groups.map((group) => [group.interval, group.items.map((item) => item.id)]), [['month', ['m']], ['year', ['y']]])
  })
})

describe('dedupeItems', () => {
  it('keeps the first of a repeated item', () => {
    const items = dedupeItems([{ kind: 'section' as const, id: 'a' }, { kind: 'package' as const, id: 'a' }, { kind: 'section' as const, id: 'a' }])
    assert.equal(items.length, 2)
  })
})

describe('priceCart with an unreachable line', () => {
  it('never discounts a line with no target, even under an everything offer', () => {
    const plan = { target: null, listCents: 19900 }
    const cart = priceCart([plan], [offer('all', 10, { appliesToEverything: true })])
    assert.equal(cart.chargeCents, 19900)
    assert.equal(cart.offer, null)
  })
})
