import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { ReportAdminPanel } from '@/app/admin/reports/[id]/report-admin-panel'
import { Badge } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { reportTypeLabel } from '@/lib/report-content'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Report' }
export const dynamic = 'force-dynamic'

export default async function AdminReportDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin()

  const report = await db.report.findUnique({
    where: { id: params.id },
    include: { _count: { select: { views: true, deliveryLogs: true } } },
  })
  if (!report) notFound()

  const [sent, failed, opened] = await Promise.all([
    db.deliveryLog.count({ where: { reportId: report.id, status: { in: ['sent', 'delivered', 'opened'] } } }),
    db.deliveryLog.count({ where: { reportId: report.id, status: 'failed' } }),
    db.deliveryLog.count({ where: { reportId: report.id, status: 'opened' } }),
  ])

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link
        href="/admin/reports"
        className="mb-6 inline-flex items-center gap-1.5 font-mono text-[12px] text-ink-dim hover:text-ink"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden />
        All reports
      </Link>

      <div className="mb-2 flex flex-wrap items-center gap-3">
        <span className="font-mono text-[12px] text-gold">{reportTypeLabel(report.type)}</span>
        <Badge tone={report.published ? 'up' : 'muted'}>
          {report.published ? 'Published' : 'Draft'}
        </Badge>
      </div>

      <h1 className="text-2xl text-ink">{report.title}</h1>
      <p className="mt-1.5 font-mono text-[12px] text-ink-dim">
        Publish date {formatDate(report.publishDate)}
        {report.publishedAt && ` · sent ${formatDate(report.publishedAt)}`}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Deliveries" value={sent} />
        <Stat label="Failed" value={failed} tone={failed > 0 ? 'down' : undefined} />
        <Stat label="Opens" value={opened} />
        <Stat label="Views" value={report._count.views} />
      </div>

      <ReportAdminPanel
        report={{
          id: report.id,
          title: report.title,
          summary: report.summary,
          publishDate: report.publishDate.toISOString().slice(0, 10),
          htmlContent: report.htmlContent,
          instruments: report.instruments ? JSON.stringify(report.instruments, null, 2) : '',
          published: report.published,
          hasPdf: Boolean(report.pdfBlobUrl),
        }}
      />
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'down' }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">{label}</div>
      <div className={`mt-1 font-mono text-xl ${tone === 'down' ? 'text-down' : 'text-ink'}`}>
        {value}
      </div>
    </div>
  )
}
