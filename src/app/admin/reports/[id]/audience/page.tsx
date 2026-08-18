import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Download } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { AudienceBar } from '@/components/charts/audience-bar'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { AUDIENCE_STATES, type AudienceState, isAudienceState, readRate } from '@/lib/audience-shape'
import { reportAudience } from '@/lib/report-audience'
import { openTrackingLive } from '@/lib/engagement'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Who read it', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Who read this report, who only opened the email, and who did neither — by name.
 *
 * The aggregate charts answer "how many". This page exists because that number is not
 * actionable on its own: the useful move after seeing a low read rate is to know which
 * six people it was, and that is a list, not a chart.
 *
 * Every member appears exactly once. The states are ordered by how far each person got,
 * and "never sent" is kept visible rather than folded away — those members did not ignore
 * anything, they joined after it went out, and hiding them would quietly overstate apathy.
 */
export default async function ReportAudiencePage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: { state?: string }
}) {
  await requireAdmin()

  const report = await db.report.findUnique({
    where: { id: params.id },
    select: { id: true, title: true, publishDate: true, published: true },
  })
  if (!report) notFound()

  const [{ rows, counts }, opensLive] = await Promise.all([
    reportAudience(report.id),
    openTrackingLive(),
  ])

  const filter: AudienceState | 'all' =
    searchParams.state && isAudienceState(searchParams.state) ? searchParams.state : 'all'
  const shown = filter === 'all' ? rows : rows.filter((row) => row.state === filter)
  const rate = readRate(counts)

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <Link
        href={`/admin/reports/${report.id}`}
        className="mb-6 inline-flex items-center gap-1.5 font-mono text-[12px] text-ink-dim hover:text-ink"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden />
        {report.title}
      </Link>

      <div className="mb-8">
        <span className="eyebrow">Engagement</span>
        <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Who read it</h1>
        <p className="mt-2 font-mono text-[12px] text-ink-dim">
          {report.title} · {formatDate(report.publishDate)}
        </p>
      </div>

      {/*
        The headline is the read rate, not the raw count — 40 readers means nothing until
        you know whether it was out of 50 or 500. It is a hero figure rather than a chart
        because it is one number.
      */}
      <div className="mb-6 rounded-lg border border-line bg-panel p-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-display text-5xl text-ink">
            {rate === null ? '—' : `${Math.round(rate * 100)}%`}
          </span>
          <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-dim">
            read it
          </span>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">
          {rate === null
            ? 'This report has not reached anybody yet.'
            : `${counts.read} of the ${counts.read + counts.opened + counts.delivered} members it reached. ` +
              `Members who joined after it went out, and any failed delivery, are excluded — they never had the chance.`}
        </p>

        <div className="mt-5">
          <AudienceBar counts={counts} />
        </div>
      </div>

      {!opensLive && counts.opened === 0 && (
        <p className="mb-6 flex items-start gap-2 rounded-lg border border-accent/30 bg-accent/5 p-3.5 text-[13px] leading-relaxed text-ink-dim">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
          <span>
            <strong className="font-medium text-ink">Email opens are not being tracked.</strong>{' '}
            Everyone who did not read the report shows as &ldquo;delivered&rdquo; rather than
            splitting into opened and unopened. Add a Resend webhook at{' '}
            <code className="font-mono text-[12px]">/api/webhooks/resend</code> with{' '}
            <code className="font-mono text-[12px]">RESEND_WEBHOOK_SECRET</code> to separate them.
            Read is unaffected, and is the better measure regardless.
          </span>
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterChip href={`/admin/reports/${report.id}/audience`} active={filter === 'all'}>
          Everyone {rows.length}
        </FilterChip>
        {AUDIENCE_STATES.map((state) => (
          <FilterChip
            key={state.key}
            href={`/admin/reports/${report.id}/audience?state=${state.key}`}
            active={filter === state.key}
          >
            {state.label} {counts[state.key]}
          </FilterChip>
        ))}

        <a
          href={`/api/admin/reports/${report.id}/audience.csv${filter === 'all' ? '' : `?state=${filter}`}`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[12px] text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
        >
          <Download className="h-3 w-3" aria-hidden />
          CSV
        </a>
      </div>

      {filter !== 'all' && (
        <p className="mb-4 text-[13px] leading-relaxed text-ink-dim">
          {AUDIENCE_STATES.find((state) => state.key === filter)?.meaning}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="rounded-lg border border-line bg-panel px-4 py-8 text-center text-[14px] text-ink-dim">
          Nobody in this group.
        </p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-line">
          {shown.map((row) => (
            <li
              key={row.memberId}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-panel px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/members?search=${encodeURIComponent(row.email)}`}
                  className="break-all text-[14px] text-ink hover:text-accent"
                >
                  {row.name ?? row.email}
                </Link>
                {row.name && (
                  <p className="break-all font-mono text-[11px] text-ink-dim">{row.email}</p>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-3">
                {row.viewedAt && (
                  <span className="hidden font-mono text-[11px] text-ink-dim sm:inline">
                    {formatDate(row.viewedAt)}
                  </span>
                )}
                <Badge tone={toneFor(row.state)}>{shortLabel(row.state)}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 font-mono text-[12px] transition-colors ${
        active
          ? 'border-accent/40 bg-accent/10 text-accent'
          : 'border-line text-ink-dim hover:text-ink'
      }`}
    >
      {children}
    </Link>
  )
}

/*
 * `failed` is the only status colour here. The rest are neutral on purpose: a member who
 * has not read this week's report is not an error, and painting them red would turn an
 * ordinary reading pattern into an alarm.
 */
function toneFor(state: AudienceState): 'up' | 'down' | 'neutral' | 'muted' {
  if (state === 'read') return 'up'
  if (state === 'failed') return 'down'
  if (state === 'not_sent') return 'muted'
  return 'neutral'
}

function shortLabel(state: AudienceState): string {
  if (state === 'opened') return 'Opened'
  if (state === 'delivered') return 'Unopened'
  if (state === 'not_sent') return 'Not sent'
  if (state === 'failed') return 'Failed'
  return 'Read'
}
