import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  accessSource,
  accessState,
  accessSummary,
  daysUntil,
  type EntitlementRow,
} from '@/lib/access-view'

const NOW = new Date('2026-09-24T12:00:00Z')
const future = new Date('2026-10-24T12:00:00Z')
const past = new Date('2026-08-24T12:00:00Z')

const row = (over: Partial<EntitlementRow> = {}): EntitlementRow => ({
  status: 'active',
  renewsAt: future,
  billingProvider: null,
  stripeSubscriptionId: null,
  ...over,
})

describe('accessSource', () => {
  it('reads a Stripe subscription id as proof, not inference', () => {
    assert.equal(accessSource(row({ stripeSubscriptionId: 'sub_123' })), 'stripe')
    // Even with the provider column disagreeing: only the webhook writes the id.
    assert.equal(
      accessSource(row({ stripeSubscriptionId: 'sub_123', billingProvider: 'cregis' })),
      'stripe',
    )
  })

  it('reads a provider with no subscription id as the payment rail', () => {
    assert.equal(accessSource(row({ billingProvider: 'cregis' })), 'crypto')
    assert.equal(accessSource(row({ billingProvider: 'stripe' })), 'stripe')
  })

  it('tells a redeemed code from a comp by whether anything is owed', () => {
    // A code grants a period, so it carries a renewal date.
    assert.equal(accessSource(row({ renewsAt: future })), 'code')
    // A hand-granted comp is open-ended: nothing renews because nothing was sold.
    assert.equal(accessSource(row({ renewsAt: null })), 'manual')
  })

  it('still reads a lapsed code as a code', () => {
    // The source is about where it came from, not whether it still works.
    assert.equal(accessSource(row({ renewsAt: past, status: 'expired' })), 'code')
  })
})

describe('accessState', () => {
  it('separates open-ended from live', () => {
    // Both read. Only one of them will ever stop on its own.
    assert.equal(accessState(row({ renewsAt: future }), NOW), 'live')
    assert.equal(accessState(row({ renewsAt: null }), NOW), 'open-ended')
  })

  it('reports a past renewal as lapsed', () => {
    assert.equal(accessState(row({ renewsAt: past }), NOW), 'lapsed')
  })

  it('reports a non-active status as lapsed, whatever the date says', () => {
    assert.equal(accessState(row({ status: 'expired', renewsAt: future }), NOW), 'lapsed')
    assert.equal(accessState(row({ status: 'cancelled', renewsAt: future }), NOW), 'lapsed')
  })

  it('reports pending separately, because it has never granted anything', () => {
    assert.equal(accessState(row({ status: 'pending' }), NOW), 'pending')
  })
})

describe('daysUntil', () => {
  it('counts forward and backward', () => {
    assert.equal(daysUntil(future, NOW), 30)
    // Negative rather than clamped: lapsed yesterday and lapsed last year are different
    // problems, and an operator triaging a list needs to see which.
    assert.equal(daysUntil(past, NOW), -31)
  })

  it('is null for an open-ended grant', () => {
    assert.equal(daysUntil(null, NOW), null)
  })
})

describe('accessSummary', () => {
  const member = (over: Partial<Parameters<typeof accessSummary>[0]> = {}) =>
    ({
      role: 'member',
      subscriptionStatus: 'expired',
      subscriptionRenewsAt: null,
      ...over,
    }) as Parameters<typeof accessSummary>[0]

  it('flags when all-access is the only thing granting anything', () => {
    // The case the admin has been hiding: a green ACTIVE badge on somebody who holds no
    // section at all, reading the whole site on the legacy membership.
    const summary = accessSummary(
      member({ subscriptionStatus: 'active', subscriptionRenewsAt: future }),
      [],
      NOW,
    )
    assert.equal(summary.allAccess, true)
    assert.equal(summary.allAccessIsLoadBearing, true)
    assert.equal(summary.liveSectionCount, 0)
  })

  it('does not flag it when they hold sections of their own', () => {
    const summary = accessSummary(
      member({ subscriptionStatus: 'active', subscriptionRenewsAt: future }),
      [row()],
      NOW,
    )
    assert.equal(summary.allAccess, true)
    assert.equal(summary.allAccessIsLoadBearing, false)
  })

  it('counts lapsed sections in the total but not in the live figure', () => {
    const summary = accessSummary(member(), [row(), row({ renewsAt: past })], NOW)
    assert.equal(summary.sectionCount, 2)
    assert.equal(summary.liveSectionCount, 1)
    assert.equal(summary.allAccess, false)
  })

  it('counts an open-ended comp as live', () => {
    const summary = accessSummary(member(), [row({ renewsAt: null })], NOW)
    assert.equal(summary.liveSectionCount, 1)
  })

  it('treats an admin as all-access, as the access rule does', () => {
    const summary = accessSummary(member({ role: 'admin' }), [], NOW)
    assert.equal(summary.allAccess, true)
  })
})
