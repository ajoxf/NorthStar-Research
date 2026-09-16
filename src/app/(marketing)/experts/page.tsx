import type { Metadata } from 'next'
import Link from 'next/link'

import { notFound } from 'next/navigation'

import { EmptyPreview } from '@/components/empty-preview'
import { PreviewBanner } from '@/components/preview-banner'
import { db } from '@/lib/db'
import { authorInitials } from '@/lib/section-shape'
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

  // Somebody with no live section has nothing to sell and nothing to show, so they are
  // not listed — a profile you cannot subscribe to is a dead end from a marketing page.
  const listed = authors.filter((author) => author.sections.length > 0)

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
                  {[...new Set(author.sections.map((section) => section.topic.name))]
                    .slice(0, 2)
                    .map((topic) => (
                      <span
                        key={topic}
                        className="rounded-full border border-white/25 bg-black/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/85 backdrop-blur-sm"
                      >
                        {topic}
                      </span>
                    ))}
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
