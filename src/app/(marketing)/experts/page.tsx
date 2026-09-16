import type { Metadata } from 'next'
import Link from 'next/link'

import { notFound } from 'next/navigation'

import { EmptyPreview } from '@/components/empty-preview'
import { PreviewBanner } from '@/components/preview-banner'
import { db } from '@/lib/db'
import { authorListable, authorInitials, comingSoonVisible } from '@/lib/section-shape'
import { sectionsVisibility } from '@/lib/sections-mode'

export const metadata: Metadata = { title: 'Contributors' }
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
    .map((author) => ({
      ...author,
      soon: comingSoonVisible({
        comingSoon: author.comingSoon,
        liveSectionCount: author.sections.length,
      }),
    }))
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

      <section className="border-b border-line bg-panel-2/60">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
          <span className="eyebrow">The desk</span>
          <h1 className="mt-4 text-balance font-display text-4xl leading-[1.05] text-ink sm:text-6xl">
            Research from practitioners.
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-dim">
            Every report is written by a named analyst who has traded the market they cover, and
            carries their reasoning in full. Subscribe to the people and the subjects you
            actually follow, rather than to everything at once.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <h2 className="text-center font-display text-3xl text-ink">Our contributors</h2>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {listed.map((author) => (
            <Link
              key={author.id}
              href={`/experts/${author.slug}`}
              className="group relative block aspect-[3/4] overflow-hidden rounded-xl border border-line bg-panel-2 transition-colors hover:border-accent/45"
            >
              {author.photoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element -- an arbitrary host,
                   which next/image would need configuring for one URL at a time. */
                <img
                  src={author.photoUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  loading="lazy"
                />
              ) : (
                /* No photograph yet: the initials at display size, so the grid stays a grid
                   of equal cards rather than one with a hole in it. */
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center font-mono text-5xl text-ink-dim"
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
                {/* What they cover, in place of the reference's employer badges — the
                    subject is what a reader is choosing between here. */}
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {author.soon ? (
                    <span className="rounded-full border border-accent/50 bg-accent/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-accent backdrop-blur-sm">
                      Coming soon
                    </span>
                  ) : (
                    [...new Set(author.sections.map((section) => section.topic.name))]
                      .slice(0, 2)
                      .map((topic) => (
                        <span
                          key={topic}
                          className="rounded-full border border-white/25 bg-black/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/85 backdrop-blur-sm"
                        >
                          {topic}
                        </span>
                      ))
                  )}
                </div>

                <h3 className="font-display text-[17px] leading-snug text-white">{author.name}</h3>
                {author.headline && (
                  <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-white/70">
                    {author.headline}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
