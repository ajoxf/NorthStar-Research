import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { fulfilmentRoute, latestEnd, linesForOrder, periodStart } from '@/lib/fulfilment-shape'

describe('linesForOrder', () => {
  it('uses stored lines when the order has them', () => {
    const lines = linesForOrder({
      sectionId: null,
      packageId: null,
      lines: [
        { id: 'l1', kind: 'section', sectionId: 's1', packageId: null, interval: 'month' },
        { id: 'l2', kind: 'package', sectionId: null, packageId: 'p1', interval: 'month' },
      ],
    })
    assert.deepEqual(lines.map((line) => [line.id, line.kind]), [['l1', 'section'], ['l2', 'package']])
  })

  it('reads an order from before lines existed as one line, section first', () => {
    assert.deepEqual(linesForOrder({ sectionId: 's1', packageId: 'p1', lines: [] }), [
      { id: null, kind: 'section', sectionId: 's1', packageId: null, interval: null },
    ])
    assert.equal(linesForOrder({ sectionId: null, packageId: 'p1', lines: [] })[0].kind, 'package')
    assert.equal(linesForOrder({ sectionId: null, packageId: null, lines: [] })[0].kind, 'plan')
  })
})

describe('periodStart', () => {
  const now = new Date('2026-10-10T12:00:00Z')
  it('stacks on time still held', () => {
    const held = new Date('2026-11-01T00:00:00Z')
    assert.equal(periodStart(now, held), held)
  })
  it('starts now when nothing is held or it has run out', () => {
    assert.equal(periodStart(now, null), now)
    assert.equal(periodStart(now, new Date('2026-09-01T00:00:00Z')), now)
  })
})

describe('latestEnd', () => {
  it('takes the latest date and ignores missing ones', () => {
    const a = new Date('2026-11-01'), b = new Date('2027-01-01')
    assert.equal(latestEnd([a, null, b, undefined]), b)
    assert.equal(latestEnd([null]), null)
  })
})

describe('fulfilmentRoute', () => {
  it('grants to somebody with an account and issues a code to everybody else', () => {
    assert.equal(fulfilmentRoute({ hasPassword: true }), 'grant')
    assert.equal(fulfilmentRoute({ hasPassword: false }), 'code')
    assert.equal(fulfilmentRoute(null), 'code')
  })
})
