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
export function segmentWhere(segment: SegmentQuery, now: Date = new Date()): Prisma.MemberWhereInput {
  const where: Prisma.MemberWhereInput = {}

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

  return where
}


export * from '@/lib/segment-query'
