import type { Metadata } from 'next'
import Link from 'next/link'

import { notFound } from 'next/navigation'

import { EmptyPreview } from '@/components/empty-preview'
import { PreviewBanner } from '@/components/preview-banner'
import { Band, BandHeading, Eyebrow } from '@/components/band'
import { db } from '@/lib/db'
import { formatPrice } from '@/lib/package-shape'
import { authorListable, authorInitials, comingSoonVisible } from '@/lib/section-shape'
import { sectionsVisibility } from '@/lib/sections-mode'

export const metadata: Metadata = { title: 'Subject matter experts' }
export const dynamic = 'force-dynamic'

/**
 * Who writes here.
 *
 * 404s until the desk turns the sections surface on, so authors, prices and report tagging
 * can all be set up on the live site while visitors see the site they saw yesterday.
 * Hidden rather than empty: a contributors page with nobody on it is worse than none.
 *
 * Photograph-led, because the page's whole job is to make named people the reason to
 * trust the research. The previous version led with a small circular avatar beside a
 * price list, which made it a catalogue of subscriptions that happened to have faces on
 * it. Here the person fills the card and the subjects they cover sit underneath.
 */
export default async function ExpertsPage() {
  const { visible, preview } = await sectionsVisibility()
  if (!visible) notFound()

  const authors = await db.author.findMany({
    where: { archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      sections: {
        where: { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
        include: { topic: true },
      },
      // Their own packages, so the card can quote the cheapest way in rather than the
      // cheapest single subject — which would understate a bundle priced below its parts.
      packages: { where: { archivedAt: null }, select: { priceCents: true, currency: true } },
      _count: { select: { sections: true } },
    },
  })

  /*
   * Who appears: anybody with a live subject, plus anybody deliberately announced.
   *
   * A profile you can neither read nor subscribe to is a dead end from a marketing page —
   * unless the desk has said out loud that it is forthcoming, which is the one case where
   * an empty profile is the point rather than an oversight.
   *
   * Announced contributors sort last within their display order, because somebody you can
   * read today is a better first card than somebody you cannot.
   */
  const listed = authors
    .map((author) => {
      /*
       * The lowest price at which you can read this person — across their packages and
       * their individual subjects, because either is a real way in and quoting only one
       * of the two would name a figure that is not actually the cheapest.
       */
      const prices = [
        ...author.packages.map((pkg) => pkg.priceCents),
        ...author.sections.map((section) => section.priceCents),
      ]
      return {
        ...author,
        fromCents: prices.length > 0 ? Math.min(...prices) : null,
        currency: author.packages[0]?.currency ?? author.sections[0]?.currency ?? 'USD',
        soon: comingSoonVisible({
          comingSoon: author.comingSoon,
          liveSectionCount: author.sections.length,
        }),
      }
    })
    .filter((author) =>
      authorListable({ comingSoon: author.comingSoon, liveSectionCount: author.sections.length }),
    )
    .sort((a, b) => Number(a.soon) - Number(b.soon))

  if (listed.length === 0) {
    if (preview) return <EmptyPreview what="contributors" />
    notFound()
  }

  return (
    <>
      {preview && <PreviewBanner />}

      {/* Dark hero, light grid — the reference's own rhythm, and the reason the faces
          below read as a gallery rather than as more of the same band. */}
      <Band tone="dark">
        <Eyebrow tone="dark">The desk</Eyebrow>
        <h1 className="mt-4 text-balance font-display text-4xl font-medium leading-[1.04] tracking-[-0.04em] text-ink sm:text-6xl">
          Research from practitioners.
        </h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-[1.7] text-ink-dim">
          Every report is written by a named expert who has traded the market they cover, and
          carries their reasoning in full. Subscribe to the people and the subjects you
          actually follow, rather than to everything at once.
        </p>
      </Band>

      <Band tone="light">
        <BandHeading className="text-center">Our subject matter experts</BandHeading>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {listed.map((author) => (
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
                {/*
                  Only a status badge sits up here now.

                  "Coming soon" is two short words and will always be one small pill, so it
                  can sit above the name without touching the photograph.
                */}
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
                  What they cover — a caption, not badges.

                  These were pills, and pills are the wrong container for this content. A
                  topic here is a sentence-length name like "Price Forecasting - Precious
                  Metals", and a badge is a shape that promises a short word. Given a long
                  one it either wraps — stacking two deep and climbing over the face in the
                  photograph — or truncates to "PRICE FORECASTING - …", which is a badge
                  with its own label cut in half. Bounding the height fixed the climbing and
                  left the second fault; there is no width at which a pill holds this text
                  well, because the problem is the container rather than the layout.

                  As a quiet line under the headline it is just a caption, where truncating
                  is ordinary rather than broken, and the face stays a face. Two at most,
                  joined — the full list is on the profile behind the card, which is where
                  somebody comparing subjects is going anyway.
                */}
                {!author.soon &&
                  (() => {
                    const topics = [
                      ...new Set(author.sections.map((section) => section.topic.name)),
                    ]
                    if (topics.length === 0) return null
                    return (
                      <p
                        title={topics.join(' · ')}
                        className="mt-1.5 truncate text-[11px] uppercase tracking-[0.1em] text-white/55"
                      >
                        {topics.slice(0, 2).join(' · ')}
                      </p>
                    )
                  })()}
                {/*
                  The price on the card, not a click away. Somebody comparing four experts
                  is comparing what each costs as much as what each covers, and making them
                  open every profile to find out is the friction this grid exists to remove.

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
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </Band>
    </>
  )
}
