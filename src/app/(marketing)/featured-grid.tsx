'use client'

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { FilterBar } from '@/components/filter-bar'
import {
  browseOrder,
  EMPTY_BROWSE_FILTER,
  priceCeilings,
  type BrowseFilterState,
  type BrowseItem,
} from '@/lib/browse-filter'
import { formatPrice } from '@/lib/package-shape'
import { UploadedImage } from '@/components/uploaded-image'

export type FeaturedCard = {
  /** The topic name, which is also this card's identity in the grid. */
  name: string
  authors: { slug: string; name: string }[]
  fromCents: number | null
  image: string | null
  href: string
  hasTrial: boolean
}

/**
 * The featured subjects, with the controls to narrow them.
 *
 * A client component because filtering has to happen without a round trip: this is the
 * first grid on the landing page, and a page reload per chip is slower than the list is
 * long. The cards are rendered from props the server already resolved, so nothing here
 * reads the database and no price or availability is decided in the browser.
 *
 * Filter state deliberately does not go in the URL. On /coverage that would be worth it —
 * a filtered browse is a thing somebody links to — but a filtered *landing page* is not,
 * and putting it in the URL would mean the homepage could be shared in a state that hides
 * most of what it exists to show.
 */
export function FeaturedGrid({
  cards,
  currency,
}: {
  cards: FeaturedCard[]
  currency: string
}) {
  const [filter, setFilter] = React.useState<BrowseFilterState>(EMPTY_BROWSE_FILTER)

  const items: BrowseItem[] = React.useMemo(
    () =>
      cards.map((card) => ({
        id: card.name,
        subjects: [card.name],
        authors: card.authors.map((author) => author.slug),
        priceCents: card.fromCents,
        hasTrial: card.hasTrial,
      })),
    [cards],
  )

  const order = React.useMemo(() => browseOrder(items, filter), [items, filter])
  const byName = React.useMemo(() => new Map(cards.map((card) => [card.name, card])), [cards])
  const shown = order.map((id) => byName.get(id)).filter((c): c is FeaturedCard => Boolean(c))

  /*
   * The author list is deduplicated across cards, not per card.
   *
   * A subject covered by two experts contributes both, and an expert covering three
   * subjects must still appear once. A Map keyed by slug does both, and keeps the order
   * the server sent rather than re-sorting people on the client.
   */
  const authors = React.useMemo(() => {
    const seen = new Map<string, { slug: string; name: string }>()
    for (const card of cards) for (const a of card.authors) if (!seen.has(a.slug)) seen.set(a.slug, a)
    return [...seen.values()]
  }, [cards])

  return (
    <>
      <FilterBar
        tone="light"
        subjects={cards.map((card) => card.name)}
        authors={authors}
        ceilings={priceCeilings(items)}
        trialCount={cards.filter((card) => card.hasTrial).length}
        currency={currency}
        value={filter}
        onChange={setFilter}
        resultCount={shown.length}
        totalCount={cards.length}
      />

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((topic) => (
          <Link
            key={topic.name}
            href={topic.href}
            className="group flex flex-col overflow-hidden rounded-2xl bg-paper-card shadow-[0_1px_2px_rgba(17,24,39,0.06)] transition-shadow hover:shadow-[0_8px_24px_rgba(17,24,39,0.10)]"
          >
            {topic.image && (
              <div className="relative aspect-[16/9] w-full overflow-hidden bg-paper">
                <UploadedImage
                  src={topic.image}
                  sizes="(min-width: 1024px) 352px, (min-width: 640px) 50vw, 100vw"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>
            )}

            <div className="flex flex-1 flex-col p-6">
              <h3 className="text-[20px] font-medium leading-[1.2] tracking-[-0.02em] text-ink-on-light">
                {topic.name}
              </h3>
              <p className="mt-2 flex-1 text-[14px] leading-[1.6] text-ink-on-light-dim">
                {topic.authors.map((author) => author.name).join(' · ')}
              </p>

              <div className="mt-5 flex items-center justify-between border-t border-line-on-light pt-4">
                {topic.fromCents !== null ? (
                  <span className="text-[15px] text-ink-on-light">
                    from{' '}
                    <span className="font-medium">{formatPrice(topic.fromCents, currency)}</span>
                    <span className="text-ink-on-light-dim">/mo</span>
                  </span>
                ) : (
                  <span className="text-[15px] text-ink-on-light-dim">Not yet on sale</span>
                )}
                {/* Named here rather than only in the filter, so somebody who scrolled
                    past the controls still sees which subjects they can read today. */}
                {topic.hasTrial && (
                  <span className="ml-3 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-on-light">
                    Trial open
                  </span>
                )}
                <ArrowRight
                  className="ml-auto h-4 w-4 text-ink-on-light-dim transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/*
        An empty result is a state, not a blank.

        Filtering to nothing is easy with four dimensions, and a grid that simply vanishes
        reads as a page that broke rather than a search that found nothing.
      */}
      {shown.length === 0 && (
        <p className="mt-8 text-[15px] text-ink-on-light-dim">
          No subject matches all of those filters. Clear one and try again.
        </p>
      )}
    </>
  )
}
