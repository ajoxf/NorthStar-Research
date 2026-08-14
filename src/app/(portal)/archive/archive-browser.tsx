'use client'

import * as React from 'react'
import { Search, SearchX } from 'lucide-react'

import { ReportRow } from '@/components/report-card'
import { Input, Select } from '@/components/ui/field'
import { REPORT_TYPES } from '@/lib/report-content'
import { cn } from '@/lib/utils'
import type { ReportType } from '@prisma/client'

type ArchiveReport = {
  id: string
  type: ReportType
  title: string
  summary: string | null
  publishDate: string
}

/**
 * Client-side filtering so type/date/search changes are instant — §6 asks for filtering
 * "without a full page reload". The full archive is already in memory from the server
 * component, so no round trip is needed.
 */
export function ArchiveBrowser({ reports }: { reports: ArchiveReport[] }) {
  const [query, setQuery] = React.useState('')
  const [type, setType] = React.useState<'all' | ReportType>('all')
  const [year, setYear] = React.useState<'all' | string>('all')

  const years = React.useMemo(() => {
    const set = new Set(reports.map((report) => new Date(report.publishDate).getFullYear().toString()))
    return Array.from(set).sort((a, b) => Number(b) - Number(a))
  }, [reports])

  const filtered = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    return reports.filter((report) => {
      if (type !== 'all' && report.type !== type) return false
      if (year !== 'all' && new Date(report.publishDate).getFullYear().toString() !== year) return false
      if (!needle) return true
      return (
        report.title.toLowerCase().includes(needle) ||
        (report.summary ?? '').toLowerCase().includes(needle)
      )
    })
  }, [reports, query, type, year])

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-dim"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles and summaries"
            aria-label="Search the archive"
            className="pl-10"
          />
        </div>

        <Select
          value={type}
          onChange={(event) => setType(event.target.value as 'all' | ReportType)}
          aria-label="Filter by report type"
          className="sm:w-56"
        >
          <option value="all">All report types</option>
          {REPORT_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.shortLabel}
            </option>
          ))}
        </Select>

        <Select
          value={year}
          onChange={(event) => setYear(event.target.value)}
          aria-label="Filter by year"
          className="sm:w-32"
        >
          <option value="all">All years</option>
          {years.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      </div>

      <p
        className={cn(
          'mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim',
          filtered.length === 0 && 'opacity-0',
        )}
        aria-live="polite"
      >
        {filtered.length} {filtered.length === 1 ? 'report' : 'reports'}
      </p>

      {filtered.length === 0 ? (
        <EmptyResults
          hasReports={reports.length > 0}
          onReset={() => {
            setQuery('')
            setType('all')
            setYear('all')
          }}
        />
      ) : (
        <div className="border-t border-line">
          {filtered.map((report) => (
            <ReportRow
              key={report.id}
              report={{ ...report, publishDate: new Date(report.publishDate) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyResults({ hasReports, onReset }: { hasReports: boolean; onReset: () => void }) {
  return (
    <div className="panel flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-panel-2">
        <SearchX className="h-5 w-5 text-ink-dim" aria-hidden />
      </div>
      <h2 className="font-serif text-lg text-ink">
        {hasReports ? 'Nothing matches those filters' : 'The archive is empty for now'}
      </h2>
      <p className="mt-2.5 max-w-sm text-[14px] leading-relaxed text-ink-dim">
        {hasReports
          ? 'Try a different report type, another year, or a shorter search term.'
          : 'Published reports will collect here. Nothing is ever removed once published.'}
      </p>
      {hasReports && (
        <button
          type="button"
          onClick={onReset}
          className="mt-6 text-[14px] text-accent underline underline-offset-4"
        >
          Clear filters
        </button>
      )}
    </div>
  )
}
