import Link from 'next/link'
import { ArrowUpRight, Clock } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn, formatDate } from '@/lib/utils'
import { reportTypeMeta } from '@/lib/report-content'
import type { ReportType } from '@prisma/client'

export type ReportCardData = {
  id: string
  type: ReportType | null
  title: string
  summary: string | null
  publishDate: Date
  viewed?: boolean
}

/** Prominent card used for the current week's reports (build spec §6). */
export function ReportCard({ report, index }: { report: ReportCardData; index?: number }) {
  const meta = reportTypeMeta(report.type)

  return (
    <Link
      href={`/reports/${report.id}`}
      className={cn(
        'panel group relative flex flex-col overflow-hidden p-6 transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-accent/45 hover:shadow-lg hover:shadow-black/30',
      )}
    >
      <span
        className="absolute inset-x-0 top-0 h-px scale-x-0 bg-gradient-to-r from-transparent via-accent to-transparent transition-transform duration-300 group-hover:scale-x-100"
        aria-hidden
      />

      <div className="mb-4 flex items-center justify-between gap-3">
        {/* Nothing rather than a borrowed label: an untyped edition is identified by its
            own title, which is where the desk now numbers its issues. */}
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
          {typeof index === 'number' && index >= 0
            ? `Report ${index + 1}`
            : (meta?.shortLabel ?? 'Research')}
        </span>
        {report.viewed ? <Badge tone="muted">Read</Badge> : <Badge tone="accent">New</Badge>}
      </div>

      <h3 className="font-display text-xl leading-snug text-ink">{report.title}</h3>

      {typeof index === 'number' && index >= 0 && meta && (
        <p className="mt-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
          {meta.shortLabel}
        </p>
      )}

      {report.summary && (
        <p className="mt-3 line-clamp-3 flex-1 text-[15px] leading-relaxed text-ink-dim">
          {report.summary}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
        <span className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
          <Clock className="h-3 w-3" aria-hidden />
          {formatDate(report.publishDate)}
        </span>
        <span className="flex items-center gap-1 text-[13px] text-accent transition-transform group-hover:translate-x-0.5">
          Read
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
    </Link>
  )
}

/** Compact row used in the archive list. */
export function ReportRow({ report }: { report: ReportCardData }) {
  const meta = reportTypeMeta(report.type)

  return (
    <Link
      href={`/reports/${report.id}`}
      className="group flex flex-col gap-2 border-b border-line px-1 py-4 transition-colors hover:bg-panel/60 sm:flex-row sm:items-center sm:gap-5"
    >
      <span className="w-32 shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
        {formatDate(report.publishDate)}
      </span>
      {meta && (
        <span className="w-44 shrink-0 font-mono text-[11px] uppercase tracking-[0.12em] text-accent">
          {meta.shortLabel}
        </span>
      )}
      <span className="flex-1 text-[15px] text-ink transition-colors group-hover:text-accent">
        {report.title}
      </span>
      <ArrowUpRight
        className="hidden h-4 w-4 shrink-0 text-ink-dim transition-transform group-hover:translate-x-0.5 group-hover:text-accent sm:block"
        aria-hidden
      />
    </Link>
  )
}
