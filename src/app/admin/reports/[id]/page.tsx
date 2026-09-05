import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowLeft, Users } from 'lucide-react'

import { ReportAdminPanel } from '@/app/admin/reports/[id]/report-admin-panel'
import { sectionName } from '@/lib/section-shape'
import { ShareLinks } from '@/app/admin/reports/[id]/share-links'
import { Badge } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth'
import { appBaseUrl } from '@/lib/env'
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

  /*
   * Every live section, plus this report's own even if it has since been taken off sale —
   * otherwise editing an old report would silently reassign it to "all-access only" the
   * moment its section was retired.
   */
  const sections = await db.section.findMany({
    where: { OR: [{ archivedAt: null }, { id: report.sectionId ?? '' }] },
    orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    include: { topic: true, author: true },
  })

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
        <span className="font-mono text-[12px] text-accent">{reportTypeLabel(report.type)}</span>
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

      {/*
        The counts above say how many; this says who. That is the version an operator can
        act on — a low read rate becomes a list of six people to call.
      */}
      <Link
        href={`/admin/reports/${report.id}/audience`}
        className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-line px-3.5 py-2 font-mono text-[12px] text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
      >
        <Users className="h-3.5 w-3.5" aria-hidden />
        See who read it
      </Link>

      {/*
        An uploaded PDF is enough to publish. The member's reader renders the pages as a
        book and pulls the charts out of them per instrument, so no second version of the
        report has to be written.

        The optional extras below add levels and prose *around* the document — they never
        replace it, and no number is ever read out of the file automatically.
      */}
      {!report.pdfBlobUrl && (
        <div className="mt-6 rounded-xl border border-down/40 bg-down/10 p-5">
          <h2 className="text-[16px] text-ink">This report has no document</h2>
          <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink-dim">
            Members will have nothing to read. Upload the edition PDF below before publishing —
            the reader builds the whole reading experience from it.
          </p>
        </div>
      )}

      <ReportAdminPanel
        report={{
          id: report.id,
          title: report.title,
          summary: report.summary,
          shareHook: report.shareHook,
          publishDate: report.publishDate.toISOString().slice(0, 10),
          htmlContent: report.htmlContent,
          instruments: report.instruments ? JSON.stringify(report.instruments, null, 2) : '',
          published: report.published,
          hasPdf: Boolean(report.pdfBlobUrl),
          sectionId: report.sectionId,
        }}
        sections={sections.map((section) => ({
          id: section.id,
          name: sectionName(section),
        }))}
      />

      {/*
        Only for a published report. Sharing a link to a draft sends somebody to a page
        that will not resolve, and there is no way for them to tell that from a fault.
      */}
      {report.published && (
        <div className="mt-6">
          <ShareLinks
            reportId={report.id}
            title={report.title}
            shareHook={report.shareHook}
            baseUrl={appBaseUrl()}
          />
        </div>
      )}
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
