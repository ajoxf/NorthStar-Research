import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { SectionBuy } from '@/app/(marketing)/coverage/section-buy'
import { AuthorAvatar } from '@/components/author-avatar'
import { ToastProvider } from '@/components/ui/toast'
import { db } from '@/lib/db'
import { formatPrice } from '@/lib/package-shape'
import { sectionName } from '@/lib/section-shape'
import { sectionsPublic } from '@/lib/sections-mode'

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
  if (!(await sectionsPublic())) notFound()

  const topics = await db.topic.findMany({
    where: { archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: {
      sections: {
        where: { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
        include: { topic: true, author: true },
      },
    },
  })

  // A topic nobody writes in yet is not a gap to explain, it is a thing to leave out.
  const covered = topics.filter((topic) => topic.sections.length > 0)
  if (covered.length === 0) notFound()

  return (
    <ToastProvider>
      <div className="mx-auto max-w-4xl px-5 py-20">
        <span className="eyebrow">Coverage</span>
        <h1 className="mt-3 text-balance text-4xl leading-tight text-ink sm:text-5xl">
          Subscribe to the subjects you follow.
        </h1>
        <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-ink-dim">
          Each subject is covered by a named expert, and each is bought separately. Take one, or
          take several — they bill independently and can be cancelled independently.
        </p>

        <div className="mt-14 space-y-14">
          {covered.map((topic) => (
            <section key={topic.id}>
              <h2 className="font-display text-2xl text-ink">{topic.name}</h2>
              {topic.blurb && (
                <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-dim">
                  {topic.blurb}
                </p>
              )}

              <div className="mt-5 grid gap-4">
                {topic.sections.map((section) => (
                  <div key={section.id} className="panel p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <AuthorAvatar
                          name={section.author.name}
                          photoUrl={section.author.photoUrl}
                          size={44}
                        />
                        <div className="min-w-0">
                          <h3 className="font-display text-lg leading-snug text-ink">
                            {sectionName(section)}
                          </h3>
                          <Link
                            href={`/experts/${section.author.slug}`}
                            className="text-[13px] text-accent underline underline-offset-4"
                          >
                            About {section.author.name}
                          </Link>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[13px] text-ink-dim">
                        {formatPrice(section.priceCents, section.currency)} / {section.interval}
                      </span>
                    </div>

                    {section.description && (
                      <p className="mt-4 text-[15px] leading-relaxed text-ink-dim">
                        {section.description}
                      </p>
                    )}

                    <div className="mt-5 border-t border-line pt-5">
                      <SectionBuy sectionId={section.id} name={sectionName(section)} />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </ToastProvider>
  )
}
