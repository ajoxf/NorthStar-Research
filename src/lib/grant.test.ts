import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  entitlementFields,
  extendedRenewal,
  grantFor,
  memberSubscriptionFields,
  monthsGranted,
} from '@/lib/grant'

const now = new Date('2026-09-05T12:00:00Z')
const renewsAt = new Date('2026-10-05T12:00:00Z')
const fallback = { interval: 'month' as const, packageId: 'pkg_1' }

describe('grantFor', () => {
  it('grants the section a code names', () => {
    const grant = grantFor({ sectionId: 'sec_1' }, fallback, { id: 'sec_1', interval: 'year' })
    assert.deepEqual(grant, { kind: 'section', interval: 'year', sectionId: 'sec_1', itemIds: [] })
  })

  it('grants all-access when the code names no section', () => {
    // Every code issued before sections, and every gifted code, is this case.
    const grant = grantFor({ sectionId: null }, fallback, null)
    assert.deepEqual(grant, { kind: 'all_access', interval: 'month', packageId: 'pkg_1', itemIds: [] })
  })

  it('falls back to all-access if the named section cannot be found', () => {
    // Defensive — sections are archived, never deleted. If it ever happens, the buyer
    // gets what they would have got before sections existed rather than nothing.
    const grant = grantFor({ sectionId: 'sec_gone' }, fallback, null)
    assert.equal(grant.kind, 'all_access')
  })
})

describe('memberSubscriptionFields', () => {
  it('writes nothing at all for a section grant', () => {
    // THE safety property. Member.subscriptionStatus *is* the all-access membership —
    // isAllAccess reads it and returns true before entitlements are consulted — so
    // setting it here would hand a $49 section buyer the entire archive.
    const grant = grantFor({ sectionId: 'sec_1' }, fallback, { id: 'sec_1', interval: 'month' })
    assert.deepEqual(memberSubscriptionFields(grant, now, renewsAt), {})
  })

  it('activates the membership for an all-access grant', () => {
    const grant = grantFor({ sectionId: null }, fallback, null)
    assert.deepEqual(memberSubscriptionFields(grant, now, renewsAt), {
      subscriptionStatus: 'active',
      subscriptionStartedAt: now,
      subscriptionRenewsAt: renewsAt,
      packageId: 'pkg_1',
    })
  })

  it('never carries a section id into a member column', () => {
    const grant = grantFor({ sectionId: 'sec_1' }, fallback, { id: 'sec_1', interval: 'month' })
    const fields = memberSubscriptionFields(grant, now, renewsAt)
    assert.ok(!JSON.stringify(fields).includes('sec_1'))
  })
})

describe('entitlementFields', () => {
  it('describes the row a section grant writes', () => {
    const grant = grantFor({ sectionId: 'sec_1' }, fallback, { id: 'sec_1', interval: 'month' })
    assert.deepEqual(entitlementFields(grant, now, renewsAt), {
      sectionId: 'sec_1',
      status: 'active',
      startedAt: now,
      renewsAt,
    })
  })

  it('writes no entitlement for an all-access grant', () => {
    const grant = grantFor({ sectionId: null }, fallback, null)
    assert.equal(entitlementFields(grant, now, renewsAt), null)
  })
})

describe('extendedRenewal', () => {
  it('adds to time that is left, so renewing early costs nothing', () => {
    const held = { renewsAt: new Date('2026-09-20T12:00:00Z') }
    assert.equal(extendedRenewal(held, 1, now)?.toISOString(), '2026-10-20T12:00:00.000Z')
  })

  it('starts from now when the entitlement has lapsed', () => {
    const lapsed = { renewsAt: new Date('2026-08-01T12:00:00Z') }
    assert.equal(extendedRenewal(lapsed, 1, now)?.toISOString(), '2026-10-05T12:00:00.000Z')
  })

  it('starts from now when nothing is held', () => {
    assert.equal(extendedRenewal(null, 1, now)?.toISOString(), '2026-10-05T12:00:00.000Z')
  })

  it('never shortens an open-ended comp', () => {
    // The bug this replaced: "no entitlement" and "an entitlement with no end date" both
    // arrived as null, so redeeming a one-month code against a comp cut it to a month.
    const comp = { renewsAt: null }
    assert.equal(extendedRenewal(comp, 1, now), null)
    assert.equal(extendedRenewal(comp, 12, now), null)
  })

  it('an open-ended grant replaces whatever was there', () => {
    assert.equal(extendedRenewal(null, null, now), null)
    assert.equal(extendedRenewal({ renewsAt: new Date('2026-09-20T12:00:00Z') }, null, now), null)
  })

  it('a longer code adds its own length, not the package default', () => {
    assert.equal(extendedRenewal(null, 3, now)?.toISOString(), '2026-12-05T12:00:00.000Z')
    assert.equal(extendedRenewal(null, 12, now)?.toISOString(), '2027-09-05T12:00:00.000Z')
  })
})

describe('monthsGranted', () => {
  it('falls back to the package interval — what every old code means', () => {
    assert.equal(monthsGranted({ grantMonths: null, grantsOpenEnded: false }, 'month'), 1)
    assert.equal(monthsGranted({ grantMonths: null, grantsOpenEnded: false }, 'year'), 12)
    // A code minted before these columns existed reads as undefined, not null.
    assert.equal(monthsGranted({}, 'month'), 1)
  })

  it('the code wins when it names a period', () => {
    assert.equal(monthsGranted({ grantMonths: 3, grantsOpenEnded: false }, 'month'), 3)
    assert.equal(monthsGranted({ grantMonths: 1, grantsOpenEnded: false }, 'year'), 1)
  })

  it('open-ended beats everything', () => {
    assert.equal(monthsGranted({ grantMonths: 3, grantsOpenEnded: true }, 'month'), null)
  })
})

describe('grantFor — what a package hands over', () => {
  it('an all-access code grants the package items: this is the bundle', () => {
    const grant = grantFor(
      { sectionId: null },
      { interval: 'month', packageId: 'pkg_bundle', itemIds: ['item_research', 'item_ramp'] },
      null,
    )
    assert.equal(grant.kind, 'all_access')
    assert.deepEqual(grant.itemIds, ['item_research', 'item_ramp'])
  })

  it('a section code grants that section only', () => {
    const grant = grantFor(
      { sectionId: 'sec_energy' },
      { interval: 'month', packageId: 'pkg_all', itemIds: ['item_research', 'item_ramp'] },
      { id: 'sec_energy', interval: 'month', itemId: 'item_energy' },
    )
    assert.equal(grant.kind, 'section')
    assert.deepEqual(grant.itemIds, ['item_energy'])
  })

  it('a half-migrated section grants what it always did and no items', () => {
    // Before the backfill runs, a section has no item. It must still grant the section.
    const grant = grantFor(
      { sectionId: 'sec_energy' },
      { interval: 'month', packageId: null },
      { id: 'sec_energy', interval: 'month', itemId: null },
    )
    assert.equal(grant.kind, 'section')
    assert.deepEqual(grant.itemIds, [])
  })

  it('a package with nothing ticked grants no items — and no accidents', () => {
    const grant = grantFor({ sectionId: null }, { interval: 'month', packageId: 'pkg_all' }, null)
    assert.deepEqual(grant.itemIds, [])
  })
})
