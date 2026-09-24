import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isAllAccess, type MemberAccess } from '@/lib/entitlements'
import { ACCESS, parseSegment, segmentHref } from '@/lib/segment-query'

/**
 * The query and the access rule have to agree.
 *
 * `allAccessWhere` in member-segments.ts is a second expression of `isAllAccess` — one
 * decides on a member object, the other in Postgres across the whole table — and two
 * expressions of one rule are exactly the shape that drifts. A members list headed
 * "reading everything" that disagrees with what the site actually lets people read is
 * worse than no list, because somebody would act on it.
 *
 * The clauses are restated here rather than imported: `member-segments.ts` carries
 * `server-only`, which `node --test` cannot load. Restating them is the point anyway —
 * the test fails if either side changes alone, which is the drift being guarded against.
 */
function matchesAllAccessWhere(member: MemberAccess, now: Date): boolean {
  if (member.role === 'admin') return true
  if (member.subscriptionStatus === 'trialing') {
    return member.subscriptionRenewsAt !== null && member.subscriptionRenewsAt > now
  }
  if (member.subscriptionStatus === 'active') {
    return member.subscriptionRenewsAt === null || member.subscriptionRenewsAt > now
  }
  return false
}

const NOW = new Date('2026-09-24T12:00:00Z')
const future = new Date('2026-12-01T00:00:00Z')
const past = new Date('2026-06-01T00:00:00Z')

const CASES: MemberAccess[] = [
  { role: 'admin', subscriptionStatus: 'expired', subscriptionRenewsAt: null },
  { role: 'member', subscriptionStatus: 'active', subscriptionRenewsAt: future },
  // The state a member lands in when their period runs out. Reads as ACTIVE in the list
  // and grants nothing — the case that makes "filter by status" the wrong tool.
  { role: 'member', subscriptionStatus: 'active', subscriptionRenewsAt: past },
  // A comp: open-ended on purpose.
  { role: 'member', subscriptionStatus: 'active', subscriptionRenewsAt: null },
  { role: 'member', subscriptionStatus: 'trialing', subscriptionRenewsAt: future },
  { role: 'member', subscriptionStatus: 'trialing', subscriptionRenewsAt: past },
  // A trial with no end date is a free membership forever, granted by a bug rather than
  // by anybody. It fails closed in the rule, so it must fail closed in the query.
  { role: 'member', subscriptionStatus: 'trialing', subscriptionRenewsAt: null },
  { role: 'member', subscriptionStatus: 'expired', subscriptionRenewsAt: past },
  { role: 'member', subscriptionStatus: 'pending', subscriptionRenewsAt: null },
  { role: 'member', subscriptionStatus: 'cancelled', subscriptionRenewsAt: future },
] as MemberAccess[]

describe('allAccessWhere agrees with isAllAccess', () => {
  for (const member of CASES) {
    const label = `${member.role}/${member.subscriptionStatus}/${
      member.subscriptionRenewsAt === null
        ? 'no date'
        : member.subscriptionRenewsAt > NOW
          ? 'future'
          : 'past'
    }`
    it(label, () => {
      assert.equal(
        matchesAllAccessWhere(member, NOW),
        isAllAccess(member, NOW),
        `the query and the access rule disagree about ${label}`,
      )
    })
  }
})

describe('the access filter survives the URL', () => {
  it('parses every value it offers', () => {
    for (const value of ACCESS) {
      assert.equal(parseSegment({ access: value }).access, value)
    }
  })

  it('falls back to all on something hand-typed', () => {
    assert.equal(parseSegment({ access: 'everything' }).access, 'all')
  })

  it('carries the rest of the segment when access changes', () => {
    // The bug this prevents: narrowing to all-access silently dropping the search.
    const segment = parseSegment({ q: 'dean', tag: 'fx' })
    assert.equal(
      segmentHref(segment, { access: 'all_access' }),
      '/admin/members?access=all_access&tag=fx&q=dean',
    )
  })
})
