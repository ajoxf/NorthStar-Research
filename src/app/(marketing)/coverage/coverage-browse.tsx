'use client'

import * as React from 'react'
import Link from 'next/link'

import { SectionBuy } from '@/app/(marketing)/coverage/section-buy'
import { AuthorAvatar } from '@/components/author-avatar'
import { BandHeading } from '@/components/band'
import { FilterBar } from '@/components/filter-bar'
import {
  browseOrder,
  EMPTY_BROWSE_FILTER,
  priceCeilings,
  type BrowseFilterState,
  type BrowseItem,
} from '@/lib/browse-filter'
import { formatPrice } from '@/lib/package-shape'

export type CoverageRow = {
  id: string
  /** The rendered "<topic> by <expert>" name, resolved on the server. */
  name: string
  topicId: string
  topicName: string
  topicBlurb: string | null
  author: { name: string; slug: string; photoUrl: string | null }
  cadence: string | null
  description: string | null
  priceCents: number
  currency: string
  interval: string
  imageUrl: string | null
  trialDays: number | null
  trialSlug: string | null
}

/**
 * The catalogue, with the controls to narrow it.
 *
 * A client component because a filter that costs a page load is a filter nobody uses
 * twice. Every row is resolved on the server first — prices, names, which subjects have a
 * trial open — so nothing commercial is decided in the browser; this only chooses which of
 * those rows to draw.
 *
 * Still grouped by topic, because that is the question a visitor arrives with: they are
 * interested in energy and want to see who covers it. A group with nothing left in it is
 * dropped rather than left as a heading over empty space.
 */
export function CoverageBrowse({ rows }: { rows: CoverageRow[] }) {
  const [filter, setFilter] = React.useState<BrowseFilterState>(EMPTY_BROWSE_FILTER)

  const items: BrowseItem[] = React.useMemo(
    () =>
      rows.map((row) => ({
        id: row.id,
        subjects: [row.topicName],
        authors: [row.author.slug],
        priceCents: row.priceCents,
        hasTrial: row.trialDays !== null,
      })),
    [rows],
  )

  const order = React.useMemo(() => browseOrder(items, filter), [items, filter])
  const byId = React.useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows])
  const shown = order.map((id) => byId.get(id)).filter((r): r is CoverageRow => Boolean(r))

  const subjects = React.useMemo(
    () => [...new Set(rows.map((row) => row.topicName))],
    [rows],
  )
  const authors = React.useMemo(() => {
    const seen = new Map<string, { slug: string; name: string }>()
    for (const row of rows) {
      if (!seen.has(row.author.slug)) seen.set(row.author.slug, row.author)
    }
    return [...seen.values()]
  }, [rows])

  /*
   * Grouped after filtering, not before.
   *
   * Grouping first and filtering inside each group leaves a heading standing over a group
   * whose every row was excluded — the page then reads as though the subject exists but
   * has nothing in it, which is a different and wrong claim.
   *
   * When a sort is asked for, the grouping is dropped: "cheapest first" across a page
   * still broken into subject groups is not cheapest first, it is cheapest-within-subject,
   * and the control would be quietly answering a question nobody asked.
   */
  const grouped = React.useMemo(() => {
    if (filter.sort !== null) return null
    const groups: { id: string; name: string; blurb: string | null; rows: CoverageRow[] }[] = []
    for (const row of shown) {
      const existing = groups.find((group) => group.id === row.topicId)
      if (existing) existing.rows.push(row)
      else groups.push({ id: row.topicId, name: row.topicName, blurb: row.topicBlurb, rows: [row] })
    }
    return groups
  }, [shown, filter.sort])

  return (
    <>
      <FilterBar
        tone="light"
        subjects={subjects}
        authors={authors}
        ceilings={priceCeilings(items)}
        trialCount={rows.filter((row) => row.trialDays !== null).length}
        currency={rows[0]?.currency ?? 'USD'}
        value={filter}
        onChange={setFilter}
        resultCount={shown.length}
        totalCount={rows.length}
      />

      {shown.length === 0 ? (
        <p className="mt-10 text-[15px] text-ink-on-light-dim">
          No subject matches all of those filters. Clear one and try again.
        </p>
      ) : grouped ? (
        <div className="mt-10 space-y-16">
          {grouped.map((group) => (
            <section key={group.id}>
              <BandHeading className="text-[28px] sm:text-[32px]">{group.name}</BandHeading>
              {group.blurb && (
                <p className="mt-2.5 max-w-2xl text-[16px] leading-[1.7] text-ink-on-light-dim">
                  {group.blurb}
                </p>
              )}
              <div className="mt-5 grid gap-4">
                {group.rows.map((row) => (
                  <SubjectCard key={row.id} row={row} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        // Sorted: one flat list, because the sort is across everything by definition.
        <div className="mt-10 grid gap-4">
          {shown.map((row) => (
            <SubjectCard key={row.id} row={row} showTopic />
          ))}
        </div>
      )}
    </>
  )
}

/** One subject on sale. Extracted so the grouped and sorted views cannot drift apart. */
function SubjectCard({ row, showTopic = false }: { row: CoverageRow; showTopic?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl bg-paper-card shadow-[0_1px_2px_rgba(17,24,39,0.06)]">
      <div className="flex flex-col sm:flex-row">
        {/*
          A thumbnail beside the card, not a banner across it. At 260px a phone photograph
          is shown at or below its natural size whatever shape it is; a full-width 21:9
          band scaled the same picture to several times its own resolution.
        */}
        {row.imageUrl && (
          <div className="shrink-0 self-start p-6 pb-0 sm:pr-0">
            <div className="aspect-[16/10] w-full overflow-hidden rounded-xl bg-paper sm:w-[260px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={row.imageUrl}
                alt=""
                className="h-full w-full object-cover object-top"
                loading="lazy"
              />
            </div>
          </div>
        )}

        <div className="min-w-0 flex-1 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <AuthorAvatar name={row.author.name} photoUrl={row.author.photoUrl} size={64} />
              <div className="min-w-0">
                {/* The subject, when the list is not grouped under it. Without this a
                    sorted view is a row of names with no indication of what they cover. */}
                {showTopic && (
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-on-light-dim">
                    {row.topicName}
                  </p>
                )}
                <h3 className="text-[20px] font-medium leading-[1.2] tracking-[-0.02em] text-ink-on-light">
                  {row.name}
                </h3>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <Link
                    href={`/experts/${row.author.slug}`}
                    className="text-[13px] text-ink-on-light-dim underline underline-offset-4 hover:text-ink-on-light"
                  >
                    About {row.author.name}
                  </Link>
                  {row.cadence && (
                    <span className="rounded-full border border-ink-on-light/20 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-on-light-dim">
                      {row.cadence}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <span className="shrink-0 text-right">
              <span className="block font-display text-[26px] font-medium leading-none tracking-[-0.03em] text-ink-on-light">
                {formatPrice(row.priceCents, row.currency)}
              </span>
              <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.14em] text-ink-on-light-dim">
                per {row.interval}
              </span>
            </span>
          </div>

          {row.description && (
            <p className="mt-4 text-[15px] leading-[1.6] text-ink-on-light-dim">
              {row.description}
            </p>
          )}

          <div className="mt-5 border-t border-line-on-light pt-5">
            <SectionBuy
              tone="light"
              sectionId={row.id}
              name={row.name}
              trialDays={row.trialDays}
              trialSlug={row.trialSlug}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
