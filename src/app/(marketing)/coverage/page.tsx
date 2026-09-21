import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CoverageBrowse } from '@/app/(marketing)/coverage/coverage-browse'
import { Band, Eyebrow } from '@/components/band'
import { EmptyPreview } from '@/components/empty-preview'
import { PreviewBanner } from '@/components/preview-banner'
import { ToastProvider } from '@/components/ui/toast'
import { db } from '@/lib/db'
import { sectionName } from '@/lib/section-shape'
import { sectionsVisibility } from '@/lib/sections-mode'
import { trialOffers } from '@/lib/trial'

export const metadata: Metadata = { title: 'Coverage' }
export const dynamic = 'force-dynamic'

/**
 * Browse by subject, and subscribe to one expert's coverage of it.
 *
 * Grouped by topic rather than by author, because that is the question a visitor arrives
 * with: they are interested in energy, and want to see who covers it. It is also what the
 * shared topic list is *for* — two experts writing on energy are two products, and this is
 * the page where that reads as a choice rather than as a duplicate.
 */
export default async function CoveragePage() {
  const { visible, preview } = await sectionsVisibility()
  if (!visible) notFound()

  const topics = await db.topic.findMany({
    where: { archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      sections: {
        where: { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
        include: { topic: true, author: true, item: { select: { slug: true } } },
      },
    },
  })

  // A topic nobody writes in yet is not a gap to explain, it is a thing to leave out.
  const covered = topics.filter((topic) => topic.sections.length > 0)

  /*
   * Which subjects have a live trial, by item slug.
   *
   * Asked of the trial system rather than read off the item's own switch, because the two
   * are not the same: an archived item has the switch on and nothing to open, and only
   * `trialOffers` knows the difference.
   */
  const sectionTrials = new Map(
    (await trialOffers())
      .filter((offer) => offer.isSection)
      .map((offer) => [offer.slug, offer.days] as const),
  )
  // Empty means "not for you" to a visitor and "not yet" to the person building it.
  if (covered.length === 0) {
    if (preview) return <EmptyPreview what="coverage" />
    notFound()
  }

  return (
    <ToastProvider>
      {preview && <PreviewBanner />}
      {/* Dark hero, light catalogue — the same rhythm the homepage and the experts
          listing use, so the three marketing pages read as one site. */}
      <Band tone="dark">
        <Eyebrow tone="dark">Coverage</Eyebrow>
        <h1 className="mt-4 text-balance font-display text-4xl font-medium leading-[1.04] tracking-[-0.04em] text-ink sm:text-6xl">
          Subscribe to the subjects you follow.
        </h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-[1.7] text-ink-dim">
          Each subject is covered by a named expert, and each is bought separately. Take one, or
          take several — they bill independently and can be cancelled independently.
        </p>
      </Band>

      <Band tone="light">
        {/* The catalogue and its controls are a client component: a filter that costs a
            page load is a filter nobody uses twice. Every row below was resolved here
            first, so nothing commercial is decided in the browser. */}
        <CoverageBrowse
          rows={covered.flatMap((topic) =>
            topic.sections.map((section) => ({
              id: section.id,
              name: sectionName(section),
              topicId: topic.id,
              topicName: topic.name,
              topicBlurb: topic.blurb,
              author: {
                name: section.author.name,
                slug: section.author.slug,
                photoUrl: section.author.photoUrl,
              },
              cadence: section.cadence,
              description: section.description,
              priceCents: section.priceCents,
              currency: section.currency,
              interval: section.interval,
              imageUrl: section.imageUrl,
              trialDays: section.item ? (sectionTrials.get(section.item.slug) ?? null) : null,
              trialSlug: section.item?.slug ?? null,
            })),
          )}
        />
      </Band>
    </ToastProvider>
  )
}
