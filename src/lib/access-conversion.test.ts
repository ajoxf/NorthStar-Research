import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { planConversion, type ConversionInput } from '@/lib/access-conversion'

const renewsAt = new Date('2027-02-01T00:00:00Z')

const input = (over: Partial<ConversionInput> = {}): ConversionInput => ({
  member: { allAccess: true, subscriptionRenewsAt: renewsAt, packageId: 'pkg_1' },
  packageSections: [{ id: 'sec_1', name: 'Crude Oil by Dean Rogers' }],
  packageFound: true,
  ...over,
})

describe('planConversion', () => {
  it('converts to the sections the package contains', () => {
    const plan = planConversion(input())
    assert.equal(plan.ok, true)
    if (!plan.ok) return
    assert.deepEqual(
      plan.sections.map((s) => s.id),
      ['sec_1'],
    )
  })

  it('carries the existing renewal date across unchanged', () => {
    // A correction to how access is recorded, not a renewal: somebody who paid to
    // February must still reach February afterwards.
    const plan = planConversion(input())
    assert.equal(plan.ok, true)
    if (!plan.ok) return
    assert.equal(plan.renewsAt?.toISOString(), renewsAt.toISOString())
  })

  it('keeps an open-ended comp open-ended', () => {
    // Null must stay null rather than quietly acquiring an expiry nobody granted.
    const plan = planConversion(
      input({ member: { allAccess: true, subscriptionRenewsAt: null, packageId: 'pkg_1' } }),
    )
    assert.equal(plan.ok, true)
    if (!plan.ok) return
    assert.equal(plan.renewsAt, null)
  })

  it('refuses a member who is already on section access', () => {
    const plan = planConversion(
      input({ member: { allAccess: false, subscriptionRenewsAt: renewsAt, packageId: 'pkg_1' } }),
    )
    assert.equal(plan.ok, false)
    if (plan.ok) return
    assert.equal(plan.reason, 'not-all-access')
  })

  it('refuses when nothing records what they bought', () => {
    // Every candidate answer is a guess: nothing cuts off somebody who paid, everything
    // is the state being fixed.
    const plan = planConversion(
      input({ member: { allAccess: true, subscriptionRenewsAt: renewsAt, packageId: null } }),
    )
    assert.equal(plan.ok, false)
    if (plan.ok) return
    assert.equal(plan.reason, 'no-package')
  })

  it('refuses when the recorded package has gone', () => {
    const plan = planConversion(input({ packageFound: false }))
    assert.equal(plan.ok, false)
    if (plan.ok) return
    assert.equal(plan.reason, 'no-package')
  })

  it('refuses an empty package rather than stripping access', () => {
    // The common case, and not a fault in the member: the remedy is upstream.
    const plan = planConversion(input({ packageSections: [] }))
    assert.equal(plan.ok, false)
    if (plan.ok) return
    assert.equal(plan.reason, 'empty-package')
    assert.match(plan.message, /package/i)
  })

  it('checks all-access before anything else', () => {
    // Somebody already converted, whose package was later emptied, must not be told the
    // package is the problem — nothing is the problem, there is nothing to do.
    const plan = planConversion(
      input({
        member: { allAccess: false, subscriptionRenewsAt: null, packageId: null },
        packageSections: [],
        packageFound: false,
      }),
    )
    assert.equal(plan.ok, false)
    if (plan.ok) return
    assert.equal(plan.reason, 'not-all-access')
  })

  it('converts to several sections when the package holds several', () => {
    const plan = planConversion(
      input({
        packageSections: [
          { id: 'sec_1', name: 'Crude Oil' },
          { id: 'sec_2', name: 'Precious Metals' },
        ],
      }),
    )
    assert.equal(plan.ok, true)
    if (!plan.ok) return
    assert.equal(plan.sections.length, 2)
  })
})
