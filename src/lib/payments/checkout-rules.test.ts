import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { alreadyHoldsSection, refuseExistingMembership } from '@/lib/payments/checkout-rules'

describe('refuseExistingMembership', () => {
  const active = { hasPassword: true, subscriptionStatus: 'active' }

  it('refuses a second recurring subscription for an active member', () => {
    assert.equal(refuseExistingMembership({ recurring: true }, active), true)
  })

  it('lets a one-off rail renew an active member — that is how crypto renews', () => {
    assert.equal(refuseExistingMembership({ recurring: false }, active), false)
  })

  it('lets a new or lapsed buyer through', () => {
    assert.equal(refuseExistingMembership({ recurring: true }, null), false)
    assert.equal(
      refuseExistingMembership({ recurring: true }, { hasPassword: true, subscriptionStatus: 'expired' }),
      false,
    )
  })

  it('lets through a paid-but-not-activated contact with no password yet', () => {
    assert.equal(
      refuseExistingMembership({ recurring: true }, { hasPassword: false, subscriptionStatus: 'active' }),
      false,
    )
  })
})

describe('alreadyHoldsSection', () => {
  const now = new Date('2026-10-10T12:00:00Z')

  it('is true for a live entitlement', () => {
    assert.equal(alreadyHoldsSection({ status: 'active', renewsAt: new Date('2026-11-01') }, now), true)
    assert.equal(alreadyHoldsSection({ status: 'active', renewsAt: null }, now), true)
  })

  it('is false once it has run out, or was never active', () => {
    assert.equal(alreadyHoldsSection({ status: 'active', renewsAt: new Date('2026-10-01') }, now), false)
    assert.equal(alreadyHoldsSection({ status: 'expired', renewsAt: null }, now), false)
    assert.equal(alreadyHoldsSection(null, now), false)
  })
})
