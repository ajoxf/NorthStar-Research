import 'server-only'

import { db } from '@/lib/db'
import { isAllAccess } from '@/lib/entitlements'
import { sectionName } from '@/lib/section-shape'
import { summariseAuthorWeek } from '@/lib/author-report'

/** Seven days, ending at the start of today. A part-week would be compared with full ones. */
const WINDOW_DAYS = 7

/** How many weeks of trend to draw. Two months reads as a trend; four weeks reads as noise. */
const HISTORY_WEEKS = 8

/**
 * One author's weekly subscriber figures: the same figures whether the desk downloads them
 * from the admin or the expert downloads them from their own page.
 *
 * Aggregate only. No member names or addresses appear in the output, and none are read
 * here: the query selects counts and dates, not people.
 */
export async function authorWeek(authorId: string) {
  const author = await db.author.findUnique({
    where: { id: authorId },
    include: {
      sections: {
        where: { archivedAt: null },
        include: { topic: true, author: true },
        orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
      },
    },
  })
  if (!author) return null

  /*
   * The window ends at the start of today, not at this instant.
   *
   * Two reports pulled on the same day would otherwise cover different periods and
   * disagree, and an author comparing this week with last would be comparing a part-week
   * with a full one.
   */
  const to = new Date()
  to.setHours(0, 0, 0, 0)
  const from = new Date(to.getTime() - WINDOW_DAYS * 86_400_000)

  const sectionIds = author.sections.map((section) => section.id)

  const [entitlements, published, reads, members] = await Promise.all([
    sectionIds.length
      ? db.entitlement.findMany({
          where: { sectionId: { in: sectionIds } },
          // Counts and dates only: no member relation is loaded, so no personal data is
          // read to produce a document that leaves the building.
          select: {
            sectionId: true,
            status: true,
            createdAt: true,
            renewsAt: true,
            // For the composition breakdown. Still no member relation: these are columns
            // about the subscription, not about the person holding it.
            billingProvider: true,
            stripeSubscriptionId: true,
          },
        })
      : Promise.resolve([]),
    /*
     * Their editions from this week, each with its own open count.
     *
     * `_count` on the relation rather than a second pass: one query, and the number
     * cannot drift from the row it is printed beside.
     */
    sectionIds.length
      ? db.report.findMany({
          where: {
            sectionId: { in: sectionIds },
            published: true,
            publishedAt: { gte: from, lt: to },
          },
          select: {
            title: true,
            publishedAt: true,
            _count: { select: { views: true } },
          },
          orderBy: { publishedAt: 'desc' },
        })
      : Promise.resolve([]),
    sectionIds.length
      ? db.reportView.count({
          where: { report: { sectionId: { in: sectionIds } }, viewedAt: { gte: from, lt: to } },
        })
      : Promise.resolve(0),
    /*
     * Members who read this author without holding any of their sections.
     *
     * Computed in memory through `isAllAccess` rather than as a where-clause, so this
     * figure and the site's own access rule cannot drift apart — the number an author is
     * told must be the number of people who can actually open their work.
     */
    db.member.findMany({
      where: { role: 'member' },
      select: { role: true, subscriptionStatus: true, subscriptionRenewsAt: true },
    }),
  ])

  const week = summariseAuthorWeek({
    authorName: author.name,
    from,
    to,
    sections: author.sections.map((section) => ({
      id: section.id,
      name: sectionName(section),
    })),
    entitlements,
    allAccessReaders: members.filter((member) => isAllAccess(member, to)).length,
    reports: published.map((report) => ({
      title: report.title,
      // Published reports always carry a date; the fallback keeps the type honest rather
      // than asserting one that the column says is optional.
      publishedAt: report.publishedAt ?? from,
      opens: report._count.views,
    })),
    reads,
    historyWeeks: HISTORY_WEEKS,
  })


  return { author, week, to }
}

/** The same figures as a PDF, with the filename it downloads under. */
export async function authorWeekPdfFile(authorId: string): Promise<{ filename: string; pdf: Uint8Array } | null> {
  const result = await authorWeek(authorId)
  if (!result) return null
  // Loaded here rather than at module scope: pdf-lib is large and every other request
  // would carry it.
  const { authorWeekPdf } = await import('@/lib/author-report-pdf')
  return {
    filename: `${result.author.slug}-subscribers-${result.to.toISOString().slice(0, 10)}.pdf`,
    pdf: await authorWeekPdf(result.week),
  }
}

/** The response every download of the report goes out as. */
export function pdfResponse(file: { filename: string; pdf: Uint8Array }): Response {
  return new Response(Buffer.from(file.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      // Figures move daily; a cached copy would be quietly out of date.
      'Cache-Control': 'private, no-store, max-age=0',
    },
  })
}
