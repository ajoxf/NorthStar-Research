import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  type EntitlementAccess,
  type MemberAccess,
  canReadReport,
  entitlementActive,
  hasAnyAccess,
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
