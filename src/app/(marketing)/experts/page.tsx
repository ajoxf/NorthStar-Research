import type { Metadata } from 'next'

import { notFound } from 'next/navigation'

import { EmptyPreview } from '@/components/empty-preview'
import { PreviewBanner } from '@/components/preview-banner'
import { Band, BandHeading, Eyebrow } from '@/components/band'
import { db } from '@/lib/db'
import { authorListable, comingSoonVisible } from '@/lib/section-shape'
import { sectionsVisibility } from '@/lib/sections-mode'
import { trialOffers } from '@/lib/trial'
import { ExpertsGrid } from '@/app/(marketing)/experts/experts-grid'

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
        include: { topic: true, item: { select: { slug: true } } },
      },
      // Their own packages, so the card can quote the cheapest way in rather than the
      // cheapest single subject — which would understate a bundle priced below its parts.
      packages: { where: { archivedAt: null }, select: { priceCents: true, currency: true } },
      _count: { select: { sections: true } },
    },
  })

  /*
   * Which subjects have a trial open, by item slug.
   *
   * Asked of the trial system rather than read off each item's own switch: an archived
   * item has the switch on and nothing to open, and only `trialOffers` knows the
   * difference.
   */
  const sectionTrials = new Set(
    (await trialOffers()).filter((offer) => offer.isSection).map((offer) => offer.slug),
  )

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

        {/* The grid and its controls are a client component: filtering through the
            server would be a page load per chip. Every figure below was resolved here. */}
        <ExpertsGrid
          experts={listed.map((author) => ({
            id: author.id,
            slug: author.slug,
            name: author.name,
            headline: author.headline,
            photoUrl: author.photoUrl,
            subjects: [...new Set(author.sections.map((section) => section.topic.name))],
            fromCents: author.fromCents,
            currency: author.currency,
            soon: author.soon,
            hasTrial: author.sections.some((section) =>
              section.item ? sectionTrials.has(section.item.slug) : false,
            ),
          }))}
        />
      </Band>
    </>
  )
}
