import 'server-only'

import { db } from '@/lib/db'

/**
 * Every member, ranked by how much of what they were sent they actually read.
 *
 * The per-report page answers "who read *this*". This answers the standing question —
 * who reads, who has stopped, who never started — which is the one that drives a renewal
 * conversation rather than a one-off nudge.
 *
 * The rate, not the raw count, is what ranks. A member who joined last week and read both
 * editions since is more engaged than one who joined a year ago and read ten of sixty,
 * and sorting by count would bury the first behind the second forever.
 */

export type ReaderRow = {
  memberId: string
  email: string
  name: string | null
  status: string
  /** Reports sent to them that did not fail. */
  sent: number
  /** Distinct reports they opened in the portal. Five visits to one report is one read. */
  read: number
  /** read / sent, or null when nothing has been sent to them yet. */
  rate: number | null
  lastReadAt: Date | null
}

export type ReaderFilter = 'all' | 'reading' | 'quiet' | 'never'

/** No read in this long, having read before, is "gone quiet". */
export const QUIET_AFTER_DAYS = 30

export async function readerStats(now: Date = new Date()): Promise<ReaderRow[]> {
  const [members, sends, views] = await Promise.all([
    db.member.findMany({
      where: { role: 'member' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        subscriptionStatus: true,
      },
    }),
    db.deliveryLog.groupBy({
      by: ['memberId'],
      // Failed sends are excluded from the denominator: nobody can read an email that
      // never arrived, and counting it against them would make deliverability look like
      // disinterest.
      where: { status: { not: 'failed' } },
      _count: { _all: true },
    }),
    db.reportView.findMany({ select: { memberId: true, reportId: true, viewedAt: true } }),
  ])

  const sentByMember = new Map(sends.map((row) => [row.memberId, row._count._all]))

  const readReports = new Map<string, Set<string>>()
  const lastRead = new Map<string, Date>()
  for (const view of views) {
    const set = readReports.get(view.memberId) ?? new Set<string>()
    set.add(view.reportId)
    readReports.set(view.memberId, set)

    const previous = lastRead.get(view.memberId)
    if (!previous || view.viewedAt > previous) lastRead.set(view.memberId, view.viewedAt)
  }

  const rows: ReaderRow[] = members.map((member) => {
    const sent = sentByMember.get(member.id) ?? 0
    const read = readReports.get(member.id)?.size ?? 0

    return {
      memberId: member.id,
      email: member.email,
      name: [member.firstName, member.lastName].filter(Boolean).join(' ') || null,
      status: member.subscriptionStatus,
      sent,
      read,
      // A member sent nothing yet has no rate — not a rate of zero, which would rank them
      // alongside people who ignore everything.
      rate: sent === 0 ? null : Math.min(read / sent, 1),
      lastReadAt: lastRead.get(member.id) ?? null,
    }
  })

  rows.sort((a, b) => {
    if (a.rate === null && b.rate === null) return a.email.localeCompare(b.email)
    if (a.rate === null) return 1
    if (b.rate === null) return -1
    if (b.rate !== a.rate) return b.rate - a.rate
    // Same rate: more reports read is the stronger record.
    return b.read - a.read
  })

  return rows
}

/**
 * Split the list the way an operator acts on it.
 *
 * `quiet` is deliberately two conditions — read something once, but not lately. "No
 * recent read" alone would sweep in everyone who never read at all, which is a different
 * group needing a different conversation.
 */
export function filterReaders(
  rows: ReaderRow[],
  filter: ReaderFilter,
  now: Date = new Date(),
): ReaderRow[] {
  const cutoff = new Date(now.getTime() - QUIET_AFTER_DAYS * 24 * 3600 * 1000)

  if (filter === 'reading') {
    return rows.filter((row) => row.lastReadAt !== null && row.lastReadAt >= cutoff)
  }
  if (filter === 'quiet') {
    return rows.filter((row) => row.lastReadAt !== null && row.lastReadAt < cutoff)
  }
  if (filter === 'never') {
    return rows.filter((row) => row.read === 0 && row.sent > 0)
  }
  return rows
}

export function readerCsv(rows: ReaderRow[]): string {
  const header = ['Email', 'Name', 'Status', 'Sent', 'Read', 'Read rate', 'Last read']
  const lines = rows.map((row) =>
    [
      row.email,
      row.name ?? '',
      row.status,
      String(row.sent),
      String(row.read),
      row.rate === null ? '' : `${Math.round(row.rate * 100)}%`,
      row.lastReadAt ? row.lastReadAt.toISOString() : '',
    ]
      .map((field) => `"${String(field).replace(/"/g, '""')}"`)
      .join(','),
  )
  return [header.map((field) => `"${field}"`).join(','), ...lines].join('\n')
}
