/**
 * The shape of a member segment, and how it survives a round trip through the URL.
 *
 * Kept apart from member-segments.ts, which builds the Prisma query, so the parsing and
 * link-building can be tested directly. Both matter: an unrecognised value reaching the
 * database as an enum is an error page, and a filter link that drops the other filters
 * silently answers a different question than the one asked.
 */

/** Days without a read before a previously-engaged member counts as lapsed. */
export const LAPSED_AFTER_DAYS = 30

export const STATUSES = ['all', 'active', 'pending', 'expired', 'cancelled'] as const
export const SOURCES = ['all', 'stripe_checkout', 'cregis_checkout', 'admin_manual'] as const
export const ENGAGEMENT = ['all', 'reader', 'never_read', 'lapsed_reader'] as const

export type StatusFilter = (typeof STATUSES)[number]
export type SourceFilter = (typeof SOURCES)[number]
export type EngagementFilter = (typeof ENGAGEMENT)[number]

export type SegmentQuery = {
  status: StatusFilter
  source: SourceFilter
  engagement: EngagementFilter
  tag: string | null
  search: string | null
}

/** Anything not recognised falls back to "all" rather than erroring on a hand-typed URL. */
export function parseSegment(params: Record<string, string | undefined>): SegmentQuery {
  function pick<T extends string>(list: readonly T[], value: string | undefined): T {
    return list.includes(value as T) ? (value as T) : list[0]
  }

  return {
    status: pick<StatusFilter>(STATUSES, params.status),
    source: pick<SourceFilter>(SOURCES, params.source),
    engagement: pick<EngagementFilter>(ENGAGEMENT, params.engagement),
    tag: params.tag?.trim() || null,
    search: params.q?.trim() || null,
  }
}

/** Is anything actually narrowed? Drives the "clear" affordance. */
export function isFiltered(segment: SegmentQuery): boolean {
  return (
    segment.status !== 'all' ||
    segment.source !== 'all' ||
    segment.engagement !== 'all' ||
    Boolean(segment.tag) ||
    Boolean(segment.search)
  )
}

/** A URL carrying the current segment plus one change — segments stay shareable. */
export function segmentHref(segment: SegmentQuery, change: Partial<SegmentQuery>): string {
  const next = { ...segment, ...change }
  const params = new URLSearchParams()
  if (next.status !== 'all') params.set('status', next.status)
  if (next.source !== 'all') params.set('source', next.source)
  if (next.engagement !== 'all') params.set('engagement', next.engagement)
  if (next.tag) params.set('tag', next.tag)
  if (next.search) params.set('q', next.search)
  const query = params.toString()
  return query ? `/admin/members?${query}` : '/admin/members'
}

export const ENGAGEMENT_LABELS: Record<EngagementFilter, string> = {
  all: 'Any engagement',
  reader: 'Has read',
  never_read: 'Never read',
  lapsed_reader: `Lapsed (${LAPSED_AFTER_DAYS}d)`,
}

export const SOURCE_LABELS: Record<SourceFilter, string> = {
  all: 'Any source',
  stripe_checkout: 'Card',
  cregis_checkout: 'Crypto',
  admin_manual: 'Manual / comped',
}
