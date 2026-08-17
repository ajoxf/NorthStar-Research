import 'server-only'

import { db } from '@/lib/db'
import { type WeekPoint, toWeeklySeries } from '@/lib/weekly-series'

/**
 * The numbers behind the Overview charts.
 *
 * Each series is shaped for exactly one chart, in the form that chart needs, because the
 * alternative — one generic "stats" blob reshaped in three components — is where charts
 * start disagreeing with each other about what a week is.
 *
 * Everything here is derived from records the product already keeps. Nothing is sampled,
 * estimated or smoothed: a flat line means nothing happened that week, not that data is
 * missing, and the charts are drawn so those two look different.
 */

export type ReportReads = {
  id: string
  title: string
  publishDate: Date
  reads: number
}

/**
 * Mutually exclusive outcomes for one report's send.
 *
 * Exclusive is the point. A member who read the report also, necessarily, received it —
 * so counting them in both "delivered" and "read" and stacking the two would draw a bar
 * longer than the number of people it was sent to. Each recipient lands in exactly one
 * bucket here, which is what makes a stacked bar honest.
 */
export type DeliveryBreakdown = {
  id: string
  title: string
  read: number
  openedNotRead: number
  deliveredNotOpened: number
  failed: number
  total: number
}

export type DashboardStats = {
  weeks: WeekPoint[]
  reads: ReportReads[]
  delivery: DeliveryBreakdown[]
}

export async function dashboardStats(now: Date = new Date()): Promise<DashboardStats> {
  const [members, reports] = await Promise.all([
    db.member.findMany({
      where: { role: 'member' },
      select: { createdAt: true, subscriptionStartedAt: true },
    }),
    db.report.findMany({
      where: { published: true },
      orderBy: { publishDate: 'desc' },
      take: 8,
      select: { id: true, title: true, publishDate: true },
    }),
  ])

  const reportIds = reports.map((report) => report.id)

  const [views, logs] = await Promise.all([
    reportIds.length
      ? db.reportView.findMany({
          where: { reportId: { in: reportIds } },
          select: { reportId: true, memberId: true },
        })
      : Promise.resolve([]),
    reportIds.length
      ? db.deliveryLog.findMany({
          where: { reportId: { in: reportIds } },
          select: { reportId: true, memberId: true, status: true },
        })
      : Promise.resolve([]),
  ])

  // Distinct members per report: five visits by one person is one reader.
  const readersByReport = new Map<string, Set<string>>()
  for (const view of views) {
    const set = readersByReport.get(view.reportId) ?? new Set<string>()
    set.add(view.memberId)
    readersByReport.set(view.reportId, set)
  }

  const delivery: DeliveryBreakdown[] = reports.map((report) => {
    const readers = readersByReport.get(report.id) ?? new Set<string>()
    let read = 0
    let openedNotRead = 0
    let deliveredNotOpened = 0
    let failed = 0

    for (const log of logs) {
      if (log.reportId !== report.id) continue
      if (log.status === 'failed') failed += 1
      else if (readers.has(log.memberId)) read += 1
      else if (log.status === 'opened' || log.status === 'clicked') openedNotRead += 1
      else deliveredNotOpened += 1
    }

    return {
      id: report.id,
      title: report.title,
      read,
      openedNotRead,
      deliveredNotOpened,
      failed,
      total: read + openedNotRead + deliveredNotOpened + failed,
    }
  })

  return {
    // Membership dates first from when the subscription began, falling back to when the
    // record was created — a comped member has no payment date but did join.
    weeks: toWeeklySeries(
      members.map((member) => member.subscriptionStartedAt ?? member.createdAt),
      12,
      now,
    ),
    reads: reports
      .map((report) => ({
        id: report.id,
        title: report.title,
        publishDate: report.publishDate,
        reads: readersByReport.get(report.id)?.size ?? 0,
      }))
      .sort((a, b) => b.publishDate.getTime() - a.publishDate.getTime()),
    delivery,
  }
}

export { weekStart, toWeeklySeries } from '@/lib/weekly-series'
export type { WeekPoint } from '@/lib/weekly-series'
