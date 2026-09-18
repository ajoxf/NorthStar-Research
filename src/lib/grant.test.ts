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

  it('grants a package its contents, and not the whole site', () => {
    /*
     * The end of all-access, in one assertion.
     *
     * A package used to take the all_access branch whatever was in it, so buying one
     * contributor's $89 package wrote the subscription columns and opened the desk's work
     * too. With contents ticked it is now its own kind of grant.
     */
    const grant = grantFor(
      { sectionId: null },
      { ...fallback, itemIds: ['item_energy', 'item_commodities'] },
      null,
    )
    assert.deepEqual(grant, {
      kind: 'package',
      interval: 'month',
      packageId: 'pkg_1',
      itemIds: ['item_energy', 'item_commodities'],
    })
  })

  it('still grants all-access for a package with no contents', () => {
    /*
     * The transitional rule, asserted so it cannot be "tidied up" into a lock-out.
     *
     * A package nobody has ticked contents onto has nothing to hand over. Granting
     * "exactly its items" would mean a buyer paying and receiving an empty portal, so the
     * empty case keeps the access it has today. Over-granting is recoverable; taking away
     * what somebody just paid for is not.
     */
    const grant = grantFor({ sectionId: null }, { ...fallback, itemIds: [] }, null)
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

  it('does not activate the membership for a package with contents', () => {
    /*
     * The same safety property as the section case, and the reason "no all-access" is a
     * code change rather than an admin one. A package buyer's access is now entirely the
     * entitlements written beside this; the two columns that would open the whole site are
     * left alone. `packageId` is recorded because the renewal length and the account page
     * need to know what they are on — nothing in `isAllAccess` reads it.
     */
    const grant = grantFor({ sectionId: null }, { ...fallback, itemIds: ['item_energy'] }, null)
    assert.deepEqual(memberSubscriptionFields(grant, now, renewsAt), { packageId: 'pkg_1' })
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
  it('a package code grants the package items: this is the bundle', () => {
    /*
     * This asserted `all_access` until packages stopped being all-access. The bundle part
     * is unchanged — "Research + RAMP" is still a package with two items ticked — but the
     * kind is now `package`, which is what stops the subscription columns being written
     * and the whole site being handed over alongside the two items.
     */
    const grant = grantFor(
      { sectionId: null },
      { interval: 'month', packageId: 'pkg_bundle', itemIds: ['item_research', 'item_ramp'] },
      null,
    )
    assert.equal(grant.kind, 'package')
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
