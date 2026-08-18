import Link from 'next/link'
import type { Metadata } from 'next'
import { Download } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth'
import {
  QUIET_AFTER_DAYS,
  type ReaderFilter,
  filterReaders,
  readerStats,
} from '@/lib/reader-stats'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Who is reading', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const FILTERS: { key: ReaderFilter; label: string; note: string }[] = [
  { key: 'all', label: 'Everyone', note: 'Every member, ranked by the share of what they were sent that they read.' },
  { key: 'reading', label: 'Reading', note: `Read something in the last ${QUIET_AFTER_DAYS} days.` },
  {
    key: 'quiet',
    label: 'Gone quiet',
    note: `Read before, but nothing in the last ${QUIET_AFTER_DAYS} days. The renewal risk worth a conversation.`,
  },
  { key: 'never', label: 'Never read', note: 'Sent reports and has never opened one.' },
]

/**
 * Who is reading — across every edition, not one.
 *
 * Ranked by rate rather than count, deliberately. A member who joined last week and read
 * both editions since is more engaged than one who joined a year ago and read ten of
 * sixty; ranking by count buries the first behind the second permanently.
 *
 * Failed deliveries are out of the denominator. Nobody can read an email that never
 * arrived, and counting it against them would dress a deliverability problem up as
 * disinterest — which is the wrong diagnosis and the wrong conversation.
 */
export default async function EngagementPage({
  searchParams,
}: {
  searchParams: { filter?: string }
}) {
  await requireAdmin()

  const rows = await readerStats()
  const filter = (FILTERS.find((entry) => entry.key === searchParams.filter)?.key ??
    'all') as ReaderFilter
  const shown = filterReaders(rows, filter)
  const active = FILTERS.find((entry) => entry.key === filter)

  const counts = Object.fromEntries(
    FILTERS.map((entry) => [entry.key, filterReaders(rows, entry.key).length]),
  ) as Record<ReaderFilter, number>

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-8">
        <span className="eyebrow">Engagement</span>
        <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Who is reading</h1>
        <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-dim">
          Every member, ranked by the share of what they were sent that they actually opened in
          the portal. Reading is the one engagement signal a mail client cannot distort — for a
          single edition, open{' '}
          <Link href="/admin/reports" className="text-accent underline underline-offset-4">
            any report
          </Link>{' '}
          and see who read it.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {FILTERS.map((entry) => (
          <Link
            key={entry.key}
            href={entry.key === 'all' ? '/admin/engagement' : `/admin/engagement?filter=${entry.key}`}
            className={`rounded-full border px-3 py-1.5 font-mono text-[12px] transition-colors ${
              filter === entry.key
                ? 'border-accent/40 bg-accent/10 text-accent'
                : 'border-line text-ink-dim hover:text-ink'
            }`}
          >
            {entry.label} {counts[entry.key]}
          </Link>
        ))}

        <a
          href={`/api/admin/engagement.csv${filter === 'all' ? '' : `?filter=${filter}`}`}
          className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 font-mono text-[12px] text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
        >
          <Download className="h-3 w-3" aria-hidden />
          CSV
        </a>
      </div>

      {active && (
        <p className="mb-4 text-[13px] leading-relaxed text-ink-dim">{active.note}</p>
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
              className="flex flex-col gap-2 border-b border-line bg-panel px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:gap-4"
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

              {/*
                A bar rather than only a number: at a glance the list sorts itself
                visually, and the figure beside it carries the precision. One hue for
                every bar — these members are nominal, so colouring by value would
                re-encode the length in the only free channel.
              */}
              <div className="flex shrink-0 items-center gap-3">
                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.round((row.rate ?? 0) * 100)}%` }}
                  />
                </div>
                <span className="w-10 text-right font-mono text-[13px] text-ink">
                  {row.rate === null ? '—' : `${Math.round(row.rate * 100)}%`}
                </span>
                <span className="w-16 text-right font-mono text-[11px] text-ink-dim">
                  {row.read}/{row.sent}
                </span>
                <span className="hidden w-24 text-right font-mono text-[11px] text-ink-dim sm:inline">
                  {row.lastReadAt ? formatDate(row.lastReadAt) : 'never'}
                </span>
                <Badge tone={row.status === 'active' ? 'up' : 'muted'}>{row.status}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 max-w-2xl text-[13px] leading-relaxed text-ink-dim">
        <span className="text-ink">Read</span> means a signed-in member opened the report in the
        portal. Failed deliveries are excluded from the denominator — nobody can read an email
        that never arrived, and counting it against them would make a delivery problem look like
        disinterest. A member with nothing sent yet shows &ldquo;—&rdquo; rather than 0%.
      </p>
    </div>
  )
}
