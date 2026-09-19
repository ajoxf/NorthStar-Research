import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SectionBuy } from '@/app/(marketing)/coverage/section-buy'
import { AuthorAvatar } from '@/components/author-avatar'
import { Band, BandHeading, Eyebrow } from '@/components/band'
import { EmptyPreview } from '@/components/empty-preview'
import { PreviewBanner } from '@/components/preview-banner'
import { ToastProvider } from '@/components/ui/toast'
import { db } from '@/lib/db'
import { formatPrice } from '@/lib/package-shape'
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
        <div className="space-y-16">
          {covered.map((topic) => (
            <section key={topic.id}>
              <BandHeading className="text-[28px] sm:text-[32px]">{topic.name}</BandHeading>
              {topic.blurb && (
                <p className="mt-2.5 max-w-2xl text-[16px] leading-[1.7] text-ink-on-light-dim">
                  {topic.blurb}
                </p>
              )}

              <div className="mt-5 grid gap-4">
                {topic.sections.map((section) => (
                  <div
                    key={section.id}
                    className="overflow-hidden rounded-2xl bg-paper-card shadow-[0_1px_2px_rgba(17,24,39,0.06)]"
                  >
                    {/*
                      A thumbnail beside the card, not a banner across it.

                      It was a full-width 21:9 band. Nobody uploads a 21:9 photograph —
                      they upload a portrait taken on a phone, and `object-cover` then
                      scales it until the short edge fits, which on a 1080px band means a
                      face blown up to several times its own resolution. It looked
                      pixelated because it *was*: the picture was being asked to be four
                      times the size it was taken at.

                      The reference sizes these as a small landscape tile beside the text,
                      and that is what makes it forgiving — at 260px a phone photograph is
                      being shown at or below its natural size whatever shape it is.
                      `object-top` keeps heads in frame rather than centring on a chest.
                    */}
                    {section.imageUrl && (
                      <div className="shrink-0 self-start p-6 pb-0 sm:pr-0">
                        <div className="aspect-[16/10] w-full overflow-hidden rounded-xl bg-paper sm:w-[260px]">
                          {/* eslint-disable-next-line @next/next/no-img-element -- an
                              arbitrary host, which next/image would need configuring for. */}
                          <img
                            src={section.imageUrl}
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
                        <AuthorAvatar
                          name={section.author.name}
                          photoUrl={section.author.photoUrl}
                          size={64}
                        />
                        <div className="min-w-0">
                          <h3 className="text-[20px] font-medium leading-[1.2] tracking-[-0.02em] text-ink-on-light">
                            {sectionName(section)}
                          </h3>
                          {/* How often it publishes, next to whose it is — the two
                              questions asked before the price is worth reading. */}
                          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                            <Link
                              href={`/experts/${section.author.slug}`}
                              className="text-[13px] text-ink-on-light-dim underline underline-offset-4 hover:text-ink-on-light"
                            >
                              About {section.author.name}
                            </Link>
                            {section.cadence && (
                              <span className="rounded-full border border-ink-on-light/20 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-on-light-dim">
                                {section.cadence}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="shrink-0 text-right">
                        <span className="block font-display text-[26px] font-medium leading-none tracking-[-0.03em] text-ink-on-light">
                          {formatPrice(section.priceCents, section.currency)}
                        </span>
                        <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.14em] text-ink-on-light-dim">
                          per {section.interval}
                        </span>
                      </span>
                    </div>

                    {section.description && (
                      <p className="mt-4 text-[15px] leading-[1.6] text-ink-on-light-dim">
                        {section.description}
                      </p>
                    )}

                    <div className="mt-5 border-t border-line-on-light pt-5">
                      <SectionBuy
                        tone="light"
                        sectionId={section.id}
                        name={sectionName(section)}
                        trialDays={section.item ? (sectionTrials.get(section.item.slug) ?? null) : null}
                        trialSlug={section.item?.slug ?? null}
                      />
                    </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </Band>
    </ToastProvider>
  )
}
