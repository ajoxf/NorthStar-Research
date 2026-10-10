import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { subscriptionTarget, type SubscriptionFacts } from '@/lib/subscription-target-shape'

const base: SubscriptionFacts = {
  linkedEntitlementIds: [],
  order: null,
  memberSubscriptionId: null,
  subscriptionId: 'sub_1',
}

describe('subscriptionTarget', () => {
  it('uses rows already linked to the subscription', () => {
    assert.deepEqual(subscriptionTarget({ ...base, linkedEntitlementIds: ['e1', 'e2'] }), {
      kind: 'entitlements',
      ids: ['e1', 'e2'],
    })
  })

  it('never treats an unlinked section purchase as all-access', () => {
    const target = subscriptionTarget({
      ...base,
      order: { sectionId: 'sec_1', packageId: null, packageItemIds: [] },
      // Even when the member's own column carries this id — the old code wrote it there.
      memberSubscriptionId: 'sub_1',
    })
    assert.deepEqual(target, { kind: 'section', sectionId: 'sec_1' })
  })

  it('never treats an unlinked package with contents as all-access', () => {
    const target = subscriptionTarget({
      ...base,
      order: { sectionId: null, packageId: 'pkg_1', packageItemIds: ['i1', 'i2'] },
      memberSubscriptionId: 'sub_1',
    })
    assert.deepEqual(target, { kind: 'items', itemIds: ['i1', 'i2'] })
  })

  it('treats the built-in plan and an empty package as all-access, as redemption does', () => {
    assert.deepEqual(
      subscriptionTarget({ ...base, order: { sectionId: null, packageId: null, packageItemIds: [] } }),
      { kind: 'all_access' },
    )
    assert.deepEqual(
      subscriptionTarget({ ...base, order: { sectionId: null, packageId: 'pkg_1', packageItemIds: [] } }),
      { kind: 'all_access' },
    )
  })

  it('falls back to all-access only on the member’s own subscription id', () => {
    assert.deepEqual(subscriptionTarget({ ...base, memberSubscriptionId: 'sub_1' }), { kind: 'all_access' })
    assert.deepEqual(subscriptionTarget({ ...base, memberSubscriptionId: 'sub_other' }), { kind: 'unknown' })
    assert.deepEqual(subscriptionTarget(base), { kind: 'unknown' })
  })
})
