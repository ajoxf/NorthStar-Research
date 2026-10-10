import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { partsCompleted, periodBack, rollBackAccess } from '@/lib/refund-access-shape'

const now = new Date('2026-10-10T12:00:00Z')

describe('rollBackAccess', () => {
  it('ends access bought by a first payment', () => {
    // Bought today for a month: one period back is today, so it ends now.
    assert.deepEqual(rollBackAccess(new Date('2026-11-10T12:00:00Z'), 'month', now), { status: 'expired', renewsAt: now })
  })

  it('keeps time paid for before a refunded renewal', () => {
    // Held to 1 Dec, renewed to 1 Jan; refunding the renewal leaves 1 Dec.
    const result = rollBackAccess(new Date('2027-01-01T00:00:00Z'), 'month', now)
    assert.equal(result?.status, 'active')
    assert.equal(result?.renewsAt?.toISOString(), '2026-12-01T00:00:00.000Z')
  })

  it('rolls a yearly period back a year', () => {
    assert.equal(periodBack(new Date('2027-10-10T00:00:00Z'), 'year').toISOString(), '2026-10-10T00:00:00.000Z')
  })

  it('leaves an open-ended comp alone', () => {
    assert.equal(rollBackAccess(null, 'month', now), null)
  })
})

describe('partsCompleted', () => {
  const parts = [{ id: 'a', grossCents: 100 }, { id: 'b', grossCents: 300 }]
  it('names only parts this refund finished', () => {
    assert.deepEqual(partsCompleted(parts, [0, 0], [100, 50]).map((p) => p.id), ['a'])
    assert.deepEqual(partsCompleted(parts, [100, 50], [100, 300]).map((p) => p.id), ['b'])
  })
  it('ends nothing on a partial refund', () => {
    assert.deepEqual(partsCompleted(parts, [0, 0], [50, 150]), [])
  })
})
