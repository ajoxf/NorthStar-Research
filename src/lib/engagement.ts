import 'server-only'

import { db } from '@/lib/db'

/**
 * Who received what, who opened it, and who actually read the report.
 *
 * ## What each number means, precisely
 *
 * - **Sent** — handed to the email provider without an error.
 * - **Opened** — the provider saw the email opened. This depends on the Resend webhook
 *   being configured; without it every row stays at `sent` and this reads zero.
 * - **Read** — a `ReportView`: the member signed in and opened the report in the portal.
 *   This is the only figure here that is not inferred, and it is the one worth trusting.
 *
 * ## Why "forwarded" is absent
 *
 * It cannot be measured. Forwarding happens entirely inside the recipient's mail client;
 * nothing is sent back to us, and no provider can report it. Anyone offering a "forwards"
 * figure is showing you something else — usually opens from a second device, counted
 * again.
 *
 * The related worry is answered by the access model rather than by analytics: a forwarded
 * report link is worthless. Every report route requires a live member session, so a
 * forwarded email gets the recipient a sign-in page, not the research. `Read` therefore
 * counts members, never onward recipients.
 *
 * ## Why email opens are the weakest number here
 *
 * Open tracking is a one-pixel image. Apple Mail Privacy Protection pre-loads it whether
 * or not the person read anything, and other clients block it entirely — so opens are
 * simultaneously over- and under-counted. It is directionally useful across a list and
 * misleading about any individual. `Read` is the honest engagement signal, which is why
 * it is the column that matters below.
 */

export type ReportEngagement = {
  id: string
  title: string
  publishDate: Date
  sent: number
  opened: number
  read: number
  failed: number
}

export type MemberEngagement = {
  id: string
  email: string
  sent: number
  opened: number
  read: number
  lastReadAt: Date | null
}

export type EngagementSummary = {
  reports: ReportEngagement[]
  members: MemberEngagement[]
  /** True once any provider event has landed — i.e. the webhook is actually wired up. */
  openTrackingLive: boolean
}

const OPENED_STATUSES = ['opened', 'clicked'] as const

export async function engagementSummary(limit = 8): Promise<EngagementSummary> {
  const reports = await db.report.findMany({
    where: { published: true },
    orderBy: { publishDate: 'desc' },
    take: limit,
    select: { id: true, title: true, publishDate: true },
  })

  const reportIds = reports.map((report) => report.id)

  const [logs, views, openedEver] = await Promise.all([
    reportIds.length
      ? db.deliveryLog.groupBy({
          by: ['reportId', 'status'],
          where: { reportId: { in: reportIds } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    reportIds.length
      ? db.reportView.groupBy({
          by: ['reportId'],
          where: { reportId: { in: reportIds } },
          _count: { memberId: true },
        })
      : Promise.resolve([]),
    db.deliveryLog.count({ where: { status: { in: [...OPENED_STATUSES] } } }),
  ])

  const byReport = new Map<string, { sent: number; opened: number; failed: number }>()
  for (const row of logs) {
    const entry = byReport.get(row.reportId) ?? { sent: 0, opened: 0, failed: 0 }
    const count = row._count._all
    // Every non-failed row was sent — `delivered`, `opened` and `clicked` all imply it.
    if (row.status === 'failed') entry.failed += count
    else entry.sent += count
    if (OPENED_STATUSES.includes(row.status as (typeof OPENED_STATUSES)[number])) {
      entry.opened += count
    }
    byReport.set(row.reportId, entry)
  }

  const viewsByReport = new Map(views.map((row) => [row.reportId, row._count.memberId]))

  const members = await topMembers(limit)

  return {
    reports: reports.map((report) => {
      const entry = byReport.get(report.id) ?? { sent: 0, opened: 0, failed: 0 }
      return {
        id: report.id,
        title: report.title,
        publishDate: report.publishDate,
        sent: entry.sent,
        opened: entry.opened,
        failed: entry.failed,
        read: viewsByReport.get(report.id) ?? 0,
      }
    }),
    members,
    openTrackingLive: openedEver > 0,
  }
}

/** The most engaged members, ranked by reports actually read. */
async function topMembers(limit: number): Promise<MemberEngagement[]> {
  const members = await db.member.findMany({
    where: { subscriptionStatus: 'active' },
    select: {
      id: true,
      email: true,
      deliveryLogs: { select: { status: true } },
      reportViews: { select: { reportId: true, viewedAt: true } },
    },
  })

  return members
    .map((member) => {
      const sent = member.deliveryLogs.filter((log) => log.status !== 'failed').length
      const opened = member.deliveryLogs.filter((log) =>
        OPENED_STATUSES.includes(log.status as (typeof OPENED_STATUSES)[number]),
      ).length
      // Distinct reports, not raw views: somebody re-opening one report five times has
      // read one report, and counting it as five would flatter the number.
      const read = new Set(member.reportViews.map((view) => view.reportId)).size
      const lastReadAt = member.reportViews.reduce<Date | null>(
        (latest, view) => (!latest || view.viewedAt > latest ? view.viewedAt : latest),
        null,
      )
      return { id: member.id, email: member.email, sent, opened, read, lastReadAt }
    })
    .sort((a, b) => b.read - a.read || b.opened - a.opened)
    .slice(0, limit)
}

/**
 * Has any provider open-event ever landed?
 *
 * The honest way to ask "is open tracking configured", because it tests the thing that
 * matters — events arriving — rather than whether a secret happens to be set. A webhook
 * registered against the wrong URL, or with a mismatched secret, has the variable set and
 * still delivers nothing.
 */
export async function openTrackingLive(): Promise<boolean> {
  const opened = await db.deliveryLog.count({ where: { status: { in: ['opened', 'clicked'] } } })
  return opened > 0
}
