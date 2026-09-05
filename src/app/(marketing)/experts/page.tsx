import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { AuthorAvatar } from '@/components/author-avatar'
import { EmptyPreview } from '@/components/empty-preview'
import { PreviewBanner } from '@/components/preview-banner'
import { db } from '@/lib/db'
import { formatPrice } from '@/lib/package-shape'
import { sectionName } from '@/lib/section-shape'
import { sectionsVisibility } from '@/lib/sections-mode'

export const metadata: Metadata = { title: 'Contributors' }
export const dynamic = 'force-dynamic'

/**
 * Who writes here.
 *
 * 404s until the desk turns the sections surface on, so authors, prices and report
 * tagging can all be set up on the live site while visitors see the site they saw
 * yesterday. Hidden rather than empty: a contributors page with nobody on it is worse
 * than no contributors page.
 */
export default async function ExpertsPage() {
  const { visible, preview } = await sectionsVisibility()
  if (!visible) notFound()

  const authors = await db.author.findMany({
    where: { archivedAt: null },
    orderBy: { name: 'asc' },
    include: {
      sections: {
        where: { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
        include: { topic: true, author: true },
      },
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
      <div className="mx-auto max-w-5xl px-5 py-20">
      <span className="eyebrow">The desk</span>
      <h1 className="mt-3 text-balance text-4xl leading-tight text-ink sm:text-5xl">
        Independent experts, each covering what they know.
      </h1>
      <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-dim">
        Every report is written by a named analyst and carries their reasoning. Subscribe to the
        people and the subjects you actually follow, rather than to everything at once.
      </p>

      <div className="mt-14 grid gap-4 sm:grid-cols-2">
        {listed.map((author) => (
          <Link
            key={author.id}
            href={`/experts/${author.slug}`}
            className="panel group flex flex-col p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/45"
          >
            <div className="flex items-center gap-4">
              <AuthorAvatar name={author.name} photoUrl={author.photoUrl} size={52} />
              <div className="min-w-0">
                <h2 className="font-display text-xl leading-snug text-ink">{author.name}</h2>
                {author.headline && (
                  <p className="mt-0.5 text-[14px] leading-snug text-ink-dim">{author.headline}</p>
                )}
              </div>
            </div>

            <ul className="mt-5 flex-1 space-y-1.5 border-t border-line pt-4">
              {author.sections.map((section) => (
                <li key={section.id} className="flex items-baseline justify-between gap-3">
                  <span className="text-[14px] text-ink">{sectionName(section)}</span>
                  <span className="shrink-0 font-mono text-[12px] text-ink-dim">
                    {formatPrice(section.priceCents, section.currency)}/{section.interval}
                  </span>
                </li>
              ))}
            </ul>

            <span className="mt-5 text-[13px] text-accent transition-transform group-hover:translate-x-0.5">
              Read their profile →
            </span>
          </Link>
        ))}
      </div>
    </div>
    </>
  )
}
