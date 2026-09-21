'use client'

import * as React from 'react'
import Link from 'next/link'

import { FilterBar } from '@/components/filter-bar'
import {
  browseOrder,
  EMPTY_BROWSE_FILTER,
  priceCeilings,
  type BrowseFilterState,
  type BrowseItem,
} from '@/lib/browse-filter'
import { formatPrice } from '@/lib/package-shape'
import { authorInitials } from '@/lib/section-shape'

export type ExpertCardRow = {
  id: string
  slug: string
  name: string
  headline: string | null
  photoUrl: string | null
  /** Topic names this person covers, in the order the server resolved them. */
  subjects: string[]
  fromCents: number | null
  currency: string
  soon: boolean
  /** Is any subject of theirs open for a free trial right now? */
  hasTrial: boolean
}

/**
 * The gallery of experts, with the controls to narrow it.
 *
 * The filter dimensions are the same four as everywhere else, but two of them mean
 * something slightly different here because a row is a person rather than a subject: the
 * subject filter keeps anybody who covers it, and the price is the cheapest way into that
 * person across their packages and their individual subjects.
 *
 * An announced contributor has no price and no trial. They survive an untouched filter and
 * drop out of a priced one, which is correct — a visitor shopping to a budget is asking
 * what they can buy, and the answer for somebody not yet publishing is nothing.
 */
export function ExpertsGrid({ experts }: { experts: ExpertCardRow[] }) {
  const [filter, setFilter] = React.useState<BrowseFilterState>(EMPTY_BROWSE_FILTER)

  const items: BrowseItem[] = React.useMemo(
    () =>
      experts.map((expert) => ({
        id: expert.id,
        subjects: expert.subjects,
        authors: [expert.slug],
        priceCents: expert.fromCents,
        hasTrial: expert.hasTrial,
      })),
    [experts],
  )

  const order = React.useMemo(() => browseOrder(items, filter), [items, filter])
  const byId = React.useMemo(() => new Map(experts.map((e) => [e.id, e])), [experts])
  const shown = order.map((id) => byId.get(id)).filter((e): e is ExpertCardRow => Boolean(e))

  const subjects = React.useMemo(
    () => [...new Set(experts.flatMap((expert) => expert.subjects))],
    [experts],
  )

  return (
    <>
      <FilterBar
        tone="light"
        subjects={subjects}
        /*
         * No author dimension on this page.
         *
         * A row here *is* an author, so the control would be a list of every card asking
         * which cards to show — the filter and the result would be the same list, and
         * picking one name is what clicking that card already does.
         */
        authors={[]}
        ceilings={priceCeilings(items)}
        trialCount={experts.filter((expert) => expert.hasTrial).length}
        currency={experts[0]?.currency ?? 'USD'}
        value={filter}
        onChange={setFilter}
        resultCount={shown.length}
        totalCount={experts.length}
      />

      {shown.length === 0 ? (
        <p className="mt-10 text-[15px] text-ink-on-light-dim">
          Nobody matches all of those filters. Clear one and try again.
        </p>
      ) : (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((author) => (
            <Link
              key={author.id}
              href={`/experts/${author.slug}`}
              className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-paper-card shadow-[0_1px_2px_rgba(17,24,39,0.06)] transition-shadow hover:shadow-[0_8px_24px_rgba(17,24,39,0.12)]"
            >
              {author.photoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element -- an arbitrary host,
                   which next/image would need configuring for one URL at a time. */
                <img
                  src={author.photoUrl}
                  alt=""
                  /* object-top for the same reason the profile hero uses it: a wide
                     headshot cropped to a portrait card should lose the floor, not the
                     top of somebody's head. */
                  className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
                  loading="lazy"
                />
              ) : (
                /* No photograph yet: the initials at display size, so the grid stays a grid
                   of equal cards rather than one with a hole in it. */
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center font-mono text-5xl text-ink-on-light-dim"
                >
                  {authorInitials(author.name)}
                </span>
              )}

              {/* The name has to stay readable over whatever photograph was uploaded, so
                  the scrim is opaque at the foot and clears entirely by halfway up. */}
              <div
                className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black via-black/75 to-transparent"
                aria-hidden
              />

              <div className="absolute inset-x-0 bottom-0 p-5">
                {/* Only a status badge sits above the name: "Coming soon" is two short
                    words and will always be one small pill. */}
                {author.soon && (
                  <span className="mb-2 inline-block rounded-full border border-accent/50 bg-accent/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-accent backdrop-blur-sm">
                    Coming soon
                  </span>
                )}

                <h3 className="font-display text-[17px] leading-snug text-white">{author.name}</h3>
                {author.headline && (
                  <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-white/70">
                    {author.headline}
                  </p>
                )}

                {/*
                  What they cover — a caption, not badges. A topic here is a
                  sentence-length name, and a badge is a shape that promises a short word:
                  given a long one it either wraps two deep and climbs over the face, or
                  truncates to a badge with its own label cut in half.
                */}
                {!author.soon && author.subjects.length > 0 && (
                  <p
                    title={author.subjects.join(' · ')}
                    className="mt-1.5 truncate text-[11px] uppercase tracking-[0.1em] text-white/55"
                  >
                    {author.subjects.slice(0, 2).join(' · ')}
                  </p>
                )}

                {/*
                  The price on the card, not a click away. Somebody comparing four experts
                  is comparing what each costs as much as what each covers.

                  Absent for a forthcoming expert: there is nothing to buy, so a figure
                  would be quoting a price for something not on sale.
                */}
                {!author.soon && author.fromCents !== null && (
                  <p className="mt-2 text-[14px] text-white">
                    from{' '}
                    <span className="font-medium">
                      {formatPrice(author.fromCents, author.currency)}
                    </span>
                    <span className="text-white/70">/mo</span>
                    {author.hasTrial && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-white/80">
                        Trial open
                      </span>
                    )}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
