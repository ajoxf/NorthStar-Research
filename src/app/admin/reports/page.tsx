import Link from 'next/link'
import type { Metadata } from 'next'

import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { appBaseUrl } from '@/lib/env'
import { reportShareMessage, whatsappShareUrl } from '@/lib/share-message'
import { reportTypeLabel } from '@/lib/report-content'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Reports' }
export const dynamic = 'force-dynamic'

export default async function AdminReportsPage() {
  await requireAdmin()

  const base = appBaseUrl()

  const reports = await db.report.findMany({
    orderBy: { publishDate: 'desc' },
    include: { _count: { select: { views: true, deliveryLogs: true } } },
  })

  return (
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

      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full min-w-[720px] text-left">
          <thead>
            <tr className="border-b border-line font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
              <th className="px-5 py-3 font-medium">Date</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Title</th>
              <th className="px-5 py-3 font-medium">Sends</th>
              <th className="px-5 py-3 font-medium">Views</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center font-mono text-[13px] text-ink-dim">
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
                  <td className="px-5 py-3.5">
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
                          Share
                        </a>
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
  )
}
