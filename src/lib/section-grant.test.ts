import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  entitlementFields,
  extendedRenewal,
  grantFor,
  memberSubscriptionFields,
} from '@/lib/section-grant'

const now = new Date('2026-09-05T12:00:00Z')
const renewsAt = new Date('2026-10-05T12:00:00Z')
const fallback = { interval: 'month' as const, packageId: 'pkg_1' }

describe('grantFor', () => {
  it('grants the section a code names', () => {
    const grant = grantFor({ sectionId: 'sec_1' }, fallback, { id: 'sec_1', interval: 'year' })
    assert.deepEqual(grant, { kind: 'section', interval: 'year', sectionId: 'sec_1' })
  })

  it('grants all-access when the code names no section', () => {
    // Every code issued before sections, and every gifted code, is this case.
    const grant = grantFor({ sectionId: null }, fallback, null)
    assert.deepEqual(grant, { kind: 'all_access', interval: 'month', packageId: 'pkg_1' })
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
  const addMonth = (from: Date) => {
    const d = new Date(from)
    d.setMonth(d.getMonth() + 1)
    return d
  }

  it('adds to time that is left, so renewing early costs nothing', () => {
    const remaining = new Date('2026-09-20T12:00:00Z')
    assert.equal(extendedRenewal(remaining, addMonth, now).toISOString(), '2026-10-20T12:00:00.000Z')
  })

  it('starts from now when the entitlement has lapsed or is new', () => {
    assert.equal(
      extendedRenewal(new Date('2026-08-01T12:00:00Z'), addMonth, now).toISOString(),
      '2026-10-05T12:00:00.000Z',
    )
    assert.equal(extendedRenewal(null, addMonth, now).toISOString(), '2026-10-05T12:00:00.000Z')
  })
})
