import Link from 'next/link'
import type { Metadata } from 'next'

import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { BackfillSections } from '@/app/admin/reports/backfill-sections'
import { CopyShareMessage } from '@/app/admin/reports/share-actions'
import { ToastProvider } from '@/components/ui/toast'
import { sectionName } from '@/lib/section-shape'
import { appBaseUrl } from '@/lib/env'
import { reportShareMessage, whatsappShareUrl } from '@/lib/share-message'
import { reportTypeLabel } from '@/lib/report-content'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Reports' }
export const dynamic = 'force-dynamic'

export default async function AdminReportsPage() {
  await requireAdmin()

  const base = appBaseUrl()

  const [reports, untagged, sections] = await Promise.all([
    db.report.findMany({
      orderBy: { publishDate: 'desc' },
      include: {
        _count: { select: { views: true, deliveryLogs: true } },
        // For the Section column. Which section a report is filed under decides who can
        // read it and whose card it appears behind, so it belongs in the list.
        section: { include: { topic: true, author: true } },
      },
    }),
    db.report.count({ where: { sectionId: null } }),
    db.section.findMany({
      where: { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
      include: { topic: true, author: true },
    }),
  ])

  return (
    <ToastProvider>
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-mono text-xl text-ink">Reports</h1>
          <p className="mt-1 font-mono text-[12px] text-ink-dim">
            {reports.length} total. Reports are never deleted — un-publish to hide one from members.
          </p>
        </div>
        <ButtonLink href="/admin/reports/new" size="sm">
          Upload a report
        </ButtonLink>
      </div>

      {/*
        Offered only while there is a back catalogue with no owner and somewhere to put
        it. Once the archive is filed this disappears rather than staying on as a button
        with nothing left to do.
      */}
      <BackfillSections
        untagged={untagged}
        sections={sections.map((section) => ({ id: section.id, name: sectionName(section) }))}
      />

      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full min-w-[860px] text-left">
          <thead>
            <tr className="border-b border-line font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Section</th>
              <th className="px-5 py-3 font-medium">Title</th>
              <th className="px-5 py-3 font-medium">Sends</th>
              <th className="px-5 py-3 font-medium">Views</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center font-mono text-[13px] text-ink-dim">
                  No reports yet. Upload the first one to get started.
                </td>
              </tr>
            ) : (
              reports.map((report) => (
                <tr key={report.id} className="border-b border-line last:border-b-0 hover:bg-panel-2">
                  <td className="whitespace-nowrap px-5 py-3.5 font-mono text-[12px] text-ink-dim">
                    {formatDate(report.publishDate)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 font-mono text-[12px] text-accent">
                    {reportTypeLabel(report.type)}
                  </td>
                  {/*
                    Where this report is filed, stated per row rather than only as a total.

                    The count of unfiled reports was already above the table, but a total
                    does not tell you which ones — and an unfiled report is invisible to
                    every member who is not all-access, and appears behind nobody's card on
                    the dashboard. "Unfiled" in red is the one state worth spotting from
                    across the list.
                  */}
                  {/* Wraps rather than holding one line: "Markets research by NordStarPro
                      Desk" on a single line pushed every title into a five-line column. */}
                  <td className="max-w-[170px] px-5 py-3.5 font-mono text-[12px] leading-snug">
                    {report.section ? (
                      <span className="text-ink-dim">{sectionName(report.section)}</span>
                    ) : (
                      <span className="text-down">Unfiled</span>
                    )}
                  </td>
                  <td className="min-w-[280px] px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <Link
                        href={`/admin/reports/${report.id}`}
                        className="text-[14px] text-ink hover:text-accent"
                      >
                        {report.title}
                      </Link>
                      {/*
                        Beside the title rather than in a column of its own: a published
                        report is the only thing worth sharing, so a whole column would be
                        mostly empty dashes.
                      */}
                      {/*
                        A plain server-rendered anchor, labelled. The earlier version was
                        an unlabelled icon inside a client component, which was both easy
                        to miss and — for reasons that resisted diagnosis — leaked width
                        past this table's scroll container on a phone. No client boundary,
                        no icon, no overflow.
                      */}
                      {report.published && (
                        <>
                          <a
                            href={whatsappShareUrl(
                              reportShareMessage(
                                { id: report.id, title: report.title, shareHook: report.shareHook },
                                base,
                              ),
                            )}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="shrink-0 whitespace-nowrap rounded border border-line px-2 py-0.5 font-mono text-[11px] text-ink-dim transition-colors hover:border-up/50 hover:text-up"
                          >
                            WhatsApp
                          </a>
                          <CopyShareMessage
                            message={reportShareMessage(
                              { id: report.id, title: report.title, shareHook: report.shareHook },
                              base,
                            )}
                          />
                          {/*
                            Says why the message reads generically. Without it an operator
                            sees "New from NordStar Pro — <title>", assumes the hook feature
                            is broken, and never finds the empty field that explains it.
                          */}
                          {!report.shareHook && (
                            <Link
                              href={`/admin/reports/${report.id}`}
                              className="shrink-0 whitespace-nowrap font-mono text-[11px] text-accent hover:underline"
                            >
                              + hook
                            </Link>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-[13px] text-ink-dim">
                    {report._count.deliveryLogs}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-[13px] text-ink-dim">
                    {report._count.views}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={report.published ? 'up' : 'muted'}>
                        {report.published ? 'Published' : 'Draft'}
                      </Badge>
                      {/* Surfaced in the list too, so an unreadable report is obvious
                          without opening every row. */}
                      {report.pdfBlobUrl && !report.htmlContent && (
                        <Badge tone="down">No reading view</Badge>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
    </ToastProvider>
  )
}
