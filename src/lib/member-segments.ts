import 'server-only'

import type { Prisma } from '@prisma/client'

import { LAPSED_AFTER_DAYS, type SegmentQuery } from '@/lib/segment-query'

/**
 * Turning a segment into a database query.
 *
 * Segments compose: status AND source AND tag AND engagement, not one-at-a-time. That is
 * the difference between a filter and a segment — "active members from the crypto
 * channel tagged FX who have never read anything" is a real thing to act on, and applying
 * only the last-clicked control would quietly answer a different question.
 *
 * Engagement is the one that cannot be a column. `reportViews: { none: {} }` is a
 * relation filter, so "never read" is computed from the reads themselves and cannot drift
 * out of date the way a cached counter would.
 */
/**
 * Members who hold the legacy all-access membership, as a query.
 *
 * **This must agree with `isAllAccess` clause for clause**, and a test asserts it does
 * against the same fixtures. The rule cannot simply be imported — it decides on one
 * member object in memory and this has to decide in Postgres across the whole table — so
 * the two are separate expressions of one rule, which is exactly the shape that drifts.
 * A list headed "reading everything" that disagrees with what the site lets people read
 * is worse than no list, because it would be acted on.
 *
 * Note what is *not* here: `active` with a renewal date in the past. That is the state a
 * member lands in when their period runs out, and it reads as ACTIVE in the members list
 * while granting nothing.
 */
export function allAccessWhere(now: Date): Prisma.MemberWhereInput {
  return {
    OR: [
      { role: 'admin' },
      // A trial with no end date fails closed in `isAllAccess`, so it is absent here too.
      { subscriptionStatus: 'trialing', subscriptionRenewsAt: { gt: now } },
      { subscriptionStatus: 'active', subscriptionRenewsAt: null },
      { subscriptionStatus: 'active', subscriptionRenewsAt: { gt: now } },
    ],
  }
}

/** Members holding at least one live section in their own right. */
export function liveSectionWhere(now: Date): Prisma.MemberWhereInput {
  return {
    entitlements: {
      some: {
        // A null section grants a product, not the desk's writing. `canReadPortal` makes
        // the same distinction, and counting one here would list somebody as a reader of
        // research they cannot open.
        sectionId: { not: null },
        status: 'active',
        OR: [{ renewsAt: null }, { renewsAt: { gt: now } }],
      },
    },
  }
}

export function segmentWhere(segment: SegmentQuery, now: Date = new Date()): Prisma.MemberWhereInput {
  const where: Prisma.MemberWhereInput = {}
  /*
   * Extra clauses go through AND rather than onto `where` directly.
   *
   * `where.OR` is already spoken for by the search box, and the access filter needs an OR
   * of its own. Assigning a second one would silently replace the first, turning "search
   * for Dean among all-access members" into "every all-access member".
   */
  const and: Prisma.MemberWhereInput[] = []

  if (segment.status !== 'all') where.subscriptionStatus = segment.status
  if (segment.source !== 'all') where.source = segment.source
  // `has` rather than `hasSome`: one tag is one condition, and combining tags is a
  // separate feature (saved segments) rather than something to guess at here.
  if (segment.tag) where.tags = { has: segment.tag }

  if (segment.search) {
    where.OR = [
      { email: { contains: segment.search, mode: 'insensitive' } },
      { firstName: { contains: segment.search, mode: 'insensitive' } },
      { lastName: { contains: segment.search, mode: 'insensitive' } },
    ]
  }

  if (segment.engagement === 'reader') {
    where.reportViews = { some: {} }
  } else if (segment.engagement === 'never_read') {
    where.reportViews = { none: {} }
  } else if (segment.engagement === 'lapsed_reader') {
    // Has read at some point, but not lately. The pair of conditions is the definition:
    // "no recent read" alone would sweep in everyone who never read at all, which is a
    // different segment with a different remedy.
    const cutoff = new Date(now.getTime() - LAPSED_AFTER_DAYS * 24 * 3600 * 1000)
    where.AND = [
      { reportViews: { some: {} } },
      { reportViews: { none: { viewedAt: { gte: cutoff } } } },
    ]
  }

  if (segment.access === 'all_access') {
    and.push(allAccessWhere(now))
  } else if (segment.access === 'sections_only') {
    // Holds a live section and is *not* reading on all-access — the people for whom the
    // per-section model is actually working.
    and.push({ NOT: allAccessWhere(now) }, liveSectionWhere(now))
  } else if (segment.access === 'nothing') {
    and.push({ NOT: allAccessWhere(now) }, { NOT: liveSectionWhere(now) })
  }

  if (and.length > 0) {
    // Concatenated, because `lapsed_reader` above may already have set one.
    where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), ...and]
  }

  return where
}


export * from '@/lib/segment-query'
