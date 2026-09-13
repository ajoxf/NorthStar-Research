import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  type EntitlementAccess,
  type MemberAccess,
  canReadReport,
  entitlementActive,
  hasAnyAccess,
  hasAnythingActive,
  isAllAccess,
  readableSectionIds,
  reportVisibilityWhere,
} from '@/lib/entitlements'

const now = new Date('2026-09-05T12:00:00Z')
const future = new Date('2026-10-05T12:00:00Z')
const past = new Date('2026-08-05T12:00:00Z')

/** A member as they exist on the live site today: all-access, no entitlements. */
function legacyMember(overrides: Partial<MemberAccess> = {}): MemberAccess {
  return {
    role: 'member',
    subscriptionStatus: 'active',
    subscriptionRenewsAt: future,
    ...overrides,
  }
}

/** Somebody who bought one section and never had a legacy membership. */
function sectionBuyer(): MemberAccess {
  return { role: 'member', subscriptionStatus: 'pending', subscriptionRenewsAt: null }
}

function ent(sectionId: string, overrides: Partial<EntitlementAccess> = {}): EntitlementAccess {
  return { sectionId, status: 'active', renewsAt: future, ...overrides }
}

/**
 * The regression suite for the deploy itself.
 *
 * Every one of these describes a member who exists on nordstarpro.com right now. If any
 * fails, the change takes access away from somebody who paid for it.
 */
describe('existing members are untouched', () => {
  it('an active member with no entitlements still reads everything', () => {
    const member = legacyMember()
    assert.equal(hasAnyAccess(member, [], now), true)
    assert.equal(canReadReport(member, { sectionId: null }, [], now), true)
    assert.equal(canReadReport(member, { sectionId: 'sec_energy' }, [], now), true)
  })

  it('an open-ended comp — null renewal date — is not treated as expired', () => {
    // The single most expensive way to get this wrong: null means "does not lapse", and
    // reading it as a missing date would cut off every hand-granted member at once.
    const member = legacyMember({ subscriptionRenewsAt: null })
    assert.equal(isAllAccess(member, now), true)
    assert.equal(canReadReport(member, { sectionId: 'sec_energy' }, [], now), true)
  })

  it('a lapsed member is still locked out, exactly as before', () => {
    const lapsed = legacyMember({ subscriptionRenewsAt: past })
    assert.equal(hasAnyAccess(lapsed, [], now), false)
    assert.equal(canReadReport(lapsed, { sectionId: null }, [], now), false)

    const cancelled = legacyMember({ subscriptionStatus: 'cancelled' })
    assert.equal(hasAnyAccess(cancelled, [], now), false)
  })

  it('admins read everything, entitlements or not', () => {
    const admin: MemberAccess = {
      role: 'admin',
      subscriptionStatus: 'expired',
      subscriptionRenewsAt: past,
    }
    assert.equal(canReadReport(admin, { sectionId: 'sec_energy' }, [], now), true)
    assert.equal(canReadReport(admin, { sectionId: null }, [], now), true)
  })

  it('matches the legacy rule on every combination it was ever asked', () => {
    // The old hasActiveSubscription, transcribed. isAllAccess must agree with it on all
    // inputs or the deploy silently changes who is a member.
    const legacy = (m: MemberAccess) =>
      m.role === 'admin'
        ? true
        : m.subscriptionStatus !== 'active'
          ? false
          : !m.subscriptionRenewsAt
            ? true
            : m.subscriptionRenewsAt.getTime() > now.getTime()

    for (const role of ['member', 'admin']) {
      for (const status of ['pending', 'active', 'expired', 'cancelled']) {
        for (const renewsAt of [null, future, past, now]) {
          const m: MemberAccess = { role, subscriptionStatus: status, subscriptionRenewsAt: renewsAt }
          assert.equal(isAllAccess(m, now), legacy(m), JSON.stringify({ role, status, renewsAt }))
        }
      }
    }
  })
})

describe('section buyers get their section and nothing else', () => {
  it('reads their own section', () => {
    const member = sectionBuyer()
    assert.equal(canReadReport(member, { sectionId: 'sec_energy' }, [ent('sec_energy')], now), true)
  })

  it('cannot read another section', () => {
    const member = sectionBuyer()
    assert.equal(canReadReport(member, { sectionId: 'sec_crypto' }, [ent('sec_energy')], now), false)
  })

  it('cannot read the untagged back catalogue', () => {
    // The expensive mistake: a single $49 section must not buy every report published
    // before sections existed. Untagged is all-access only.
    const member = sectionBuyer()
    assert.equal(canReadReport(member, { sectionId: null }, [ent('sec_energy')], now), false)
  })

  it('holds several sections at once, independently', () => {
    const member = sectionBuyer()
    const held = [ent('sec_energy'), ent('sec_crypto', { renewsAt: past })]
    assert.equal(canReadReport(member, { sectionId: 'sec_energy' }, held, now), true)
    // Lapsed on its own renewal date, while the other stays live. This is the whole point
    // of separate entitlements.
    assert.equal(canReadReport(member, { sectionId: 'sec_crypto' }, held, now), false)
    assert.equal(hasAnyAccess(member, held, now), true)
  })

  it('gets into the portal on one live section', () => {
    assert.equal(hasAnyAccess(sectionBuyer(), [ent('sec_energy')], now), true)
  })

  it('is locked out once every section has lapsed', () => {
    const dead = [ent('sec_energy', { renewsAt: past }), ent('sec_crypto', { status: 'cancelled' })]
    assert.equal(hasAnyAccess(sectionBuyer(), dead, now), false)
  })
})

describe('entitlementActive', () => {
  it('requires the status as well as the date', () => {
    assert.equal(entitlementActive({ status: 'active', renewsAt: future }, now), true)
    assert.equal(entitlementActive({ status: 'pending', renewsAt: future }, now), false)
    assert.equal(entitlementActive({ status: 'cancelled', renewsAt: future }, now), false)
    assert.equal(entitlementActive({ status: 'expired', renewsAt: future }, now), false)
  })

  it('treats a null renewal date as open-ended, and the exact boundary as lapsed', () => {
    assert.equal(entitlementActive({ status: 'active', renewsAt: null }, now), true)
    assert.equal(entitlementActive({ status: 'active', renewsAt: now }, now), false)
    assert.equal(entitlementActive({ status: 'active', renewsAt: past }, now), false)
  })
})

describe('query filtering', () => {
  it('an all-access member is not filtered at all', () => {
    // null, not []. An empty list would mean "may read nothing", and confusing the two is
    // how a filter shows everybody everything.
    assert.equal(readableSectionIds(legacyMember(), [], now), null)
    assert.deepEqual(reportVisibilityWhere(legacyMember(), [], now), {})
  })

  it('a section member is restricted to their live sections', () => {
    const held = [ent('sec_energy'), ent('sec_crypto', { renewsAt: past })]
    assert.deepEqual(readableSectionIds(sectionBuyer(), held, now), ['sec_energy'])
    assert.deepEqual(reportVisibilityWhere(sectionBuyer(), held, now), {
      sectionId: { in: ['sec_energy'] },
    })
  })

  it('a member with nothing live is restricted to an empty set, not to everything', () => {
    assert.deepEqual(readableSectionIds(sectionBuyer(), [], now), [])
    assert.deepEqual(reportVisibilityWhere(sectionBuyer(), [], now), { sectionId: { in: [] } })
  })

  it('the filter excludes untagged reports without saying so', () => {
    // `sectionId: { in: [...] }` never matches null in Postgres, so the all-access-only
    // back catalogue drops out of a section member's queries for free. Asserted because
    // it is load-bearing and invisible.
    const where = reportVisibilityWhere(sectionBuyer(), [ent('sec_energy')], now)
    assert.ok(where.sectionId && !('null' in where.sectionId))
    assert.deepEqual(where.sectionId.in, ['sec_energy'])
  })
})

/**
 * A product entitlement is not a research membership.
 *
 * The trial signup writes an Entitlement with an itemId and no sectionId. Every gate in
 * the portal has to read that as "holds Nexus RAMP", never as "is a member of the desk".
 */
describe('an item entitlement opens no research doors', () => {
  const trialist = sectionBuyer()
  const rampTrial: EntitlementAccess = {
    sectionId: null,
    itemId: 'item_nexus_ramp',
    status: 'active',
    renewsAt: future,
  }

  it('does not let a trialist into the portal', () => {
    assert.equal(hasAnyAccess(trialist, [rampTrial], now), false)
  })

  it('reads no reports, tagged or untagged', () => {
    assert.equal(canReadReport(trialist, { sectionId: null }, [rampTrial], now), false)
    assert.equal(canReadReport(trialist, { sectionId: 'sec_energy' }, [rampTrial], now), false)
  })

  it('filters the archive down to nothing', () => {
    assert.deepEqual(readableSectionIds(trialist, [rampTrial], now), [])
    assert.deepEqual(reportVisibilityWhere(trialist, [rampTrial], now), { sectionId: { in: [] } })
  })

  it('still lets them in once they also hold a section', () => {
    // The combination matters: buying a section later must not be cancelled out by
    // holding a product, and holding a product must not survive the section lapsing.
    assert.equal(hasAnyAccess(trialist, [rampTrial, ent('sec_energy')], now), true)
    assert.equal(
      hasAnyAccess(trialist, [rampTrial, ent('sec_energy', { renewsAt: past })], now),
      false,
    )
  })
})

/**
 * A trialled research section behaves exactly like a bought one.
 *
 * The trial writes `sectionId` as well as `itemId` precisely so this is true. Without the
 * section the entitlement would pass the portal gate and read nothing — access that looks
 * granted and is not.
 */
describe('a section trial reads that section and no more', () => {
  const trialist = sectionBuyer()
  const trial: EntitlementAccess = {
    sectionId: 'sec_energy',
    itemId: 'item_section_energy',
    status: 'active',
    renewsAt: future,
  }

  it('opens the portal', () => {
    assert.equal(hasAnyAccess(trialist, [trial], now), true)
  })

  it('reads its own section', () => {
    assert.equal(canReadReport(trialist, { sectionId: 'sec_energy' }, [trial], now), true)
  })

  it('reads no other section, and none of the untagged back catalogue', () => {
    assert.equal(canReadReport(trialist, { sectionId: 'sec_indices' }, [trial], now), false)
    assert.equal(canReadReport(trialist, { sectionId: null }, [trial], now), false)
  })

  it('closes on the day it ends, without waiting for the nightly job', () => {
    const lapsed = { ...trial, renewsAt: past }
    assert.equal(hasAnyAccess(trialist, [lapsed], now), false)
    assert.equal(canReadReport(trialist, { sectionId: 'sec_energy' }, [lapsed], now), false)
  })

  it('filters the archive to that one section', () => {
    assert.deepEqual(readableSectionIds(trialist, [trial], now), ['sec_energy'])
  })
})

/**
 * The two questions that must never collapse into one.
 *
 * `hasAnyAccess` gates the research portal and says no to a product trialist. That is
 * correct and was fixed deliberately. `hasAnythingActive` is for telling somebody how they
 * stand, and says yes. If a later edit makes them agree, either a trialist is labelled
 * inactive while holding a live product, or one walks into the archive.
 */
describe('holding something is not the same as having research access', () => {
  const productOnly: EntitlementAccess = { sectionId: null, status: 'active', renewsAt: future }

  it('a Nexus RAMP trialist holds something', () => {
    assert.equal(hasAnythingActive(sectionBuyer(), [productOnly], now), true)
  })

  it('...but is still kept out of the research portal', () => {
    assert.equal(hasAnyAccess(sectionBuyer(), [productOnly], now), false)
  })

  it('an account with nothing on it holds nothing', () => {
    assert.equal(hasAnythingActive(sectionBuyer(), [], now), false)
  })

  it('an expired product does not count as holding something', () => {
    const lapsed: EntitlementAccess = { sectionId: null, status: 'active', renewsAt: past }
    assert.equal(hasAnythingActive(sectionBuyer(), [lapsed], now), false)
  })

  it('a cancelled product does not count either', () => {
    const cancelled: EntitlementAccess = { sectionId: null, status: 'cancelled', renewsAt: future }
    assert.equal(hasAnythingActive(sectionBuyer(), [cancelled], now), false)
  })

  it('a section buyer holds something, and both agree for once', () => {
    assert.equal(hasAnythingActive(sectionBuyer(), [ent('sec_energy')], now), true)
    assert.equal(hasAnyAccess(sectionBuyer(), [ent('sec_energy')], now), true)
  })

  it('an all-access member holds something with no entitlement rows at all', () => {
    assert.equal(hasAnythingActive(legacyMember(), [], now), true)
  })
})
