import Link from 'next/link'
import type { Metadata } from 'next'

import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { reportTypeLabel } from '@/lib/report-content'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Reports' }
export const dynamic = 'force-dynamic'

export default async function AdminReportsPage() {
  await requireAdmin()

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

      <div className="overflow-x-auto rounded-lg border border-line bg-panel">
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
                    <Link
                      href={`/admin/reports/${report.id}`}
                      className="text-[14px] text-ink hover:text-accent"
                    >
                      {report.title}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-[13px] text-ink-dim">
                    {report._count.deliveryLogs}
                  </td>
                  <td className="px-5 py-3.5 font-mono text-[13px] text-ink-dim">
                    {report._count.views}
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={report.published ? 'up' : 'muted'}>
                      {report.published ? 'Published' : 'Draft'}
                    </Badge>
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
