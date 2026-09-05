import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink, Lock } from 'lucide-react'

import { SectionBuy } from '@/app/(marketing)/coverage/section-buy'
import { AuthorAvatar } from '@/components/author-avatar'
import { ToastProvider } from '@/components/ui/toast'
import { db } from '@/lib/db'
import { formatPrice } from '@/lib/package-shape'
import { sectionName } from '@/lib/section-shape'
import { sectionsPublic } from '@/lib/sections-mode'
import { formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const author = await db.author.findUnique({ where: { slug: params.slug } })
  if (!author) return { title: 'Contributor' }
  return {
    title: author.name,
    description: author.headline ?? undefined,
  }
}

/**
 * One expert: who they are, what they cover, and what they have published.
 *
 * The report list is titles and dates only — never a summary, never a link that renders
 * anything. This is a public page, and the whole product rests on research being readable
 * only inside an authenticated session. What it is for is evidence: somebody deciding
 * whether to pay $49 a month for this person's work should be able to see that the work
 * exists and how often it lands.
 */
export default async function ExpertPage({ params }: { params: { slug: string } }) {
  if (!(await sectionsPublic())) notFound()

  const author = await db.author.findUnique({
    where: { slug: params.slug },
    include: {
      sections: {
        where: { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
        include: { topic: true, author: true },
      },
    },
  })

  if (!author || author.archivedAt !== null) notFound()

  const recent = await db.report.findMany({
    where: {
      published: true,
      section: { authorId: author.id },
    },
    orderBy: { publishDate: 'desc' },
    take: 8,
    select: { id: true, title: true, publishDate: true },
  })

  const links = [
    { href: author.websiteUrl, label: 'Website' },
    { href: author.linkedinUrl, label: 'LinkedIn' },
    { href: author.xUrl, label: 'X' },
  ].filter((link): link is { href: string; label: string } => Boolean(link.href))

  return (
    <ToastProvider>
      <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
        <Link
          href="/experts"
          className="font-mono text-[12px] text-ink-dim hover:text-ink"
        >
          ← All contributors
        </Link>

        <div className="mt-8 flex flex-wrap items-center gap-5">
          <AuthorAvatar name={author.name} photoUrl={author.photoUrl} size={84} />
          <div className="min-w-0">
            <h1 className="text-balance text-3xl leading-tight text-ink sm:text-4xl">
              {author.name}
            </h1>
            {author.headline && (
              <p className="mt-2 text-[16px] leading-relaxed text-ink-dim">{author.headline}</p>
            )}
          </div>
        </div>

        {author.bio && (
          <div className="mt-8 space-y-4 text-[16px] leading-relaxed text-ink-dim">
            {author.bio.split('\n').filter(Boolean).map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        )}

        {author.credentials.length > 0 && (
          <ul className="mt-8 flex flex-wrap gap-2">
            {author.credentials.map((credential) => (
              <li
                key={credential}
                className="rounded-full border border-line px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim"
              >
                {credential}
              </li>
            ))}
          </ul>
        )}

        {links.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-4">
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                // noopener/noreferrer on a link whose href was typed into an admin form.
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 text-[14px] text-accent underline underline-offset-4"
              >
                {link.label}
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              </a>
            ))}
          </div>
        )}

        <section className="mt-14">
          <h2 className="font-display text-2xl text-ink">Subscribe to their coverage</h2>
          <div className="mt-5 grid gap-4">
            {author.sections.map((section) => (
              <div key={section.id} className="panel p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h3 className="font-display text-xl text-ink">{sectionName(section)}</h3>
                  <span className="font-mono text-[13px] text-ink-dim">
                    {formatPrice(section.priceCents, section.currency)} / {section.interval}
                  </span>
                </div>
                {section.description && (
                  <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
                    {section.description}
                  </p>
                )}
                <div className="mt-5">
                  <SectionBuy sectionId={section.id} name={sectionName(section)} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {recent.length > 0 && (
          <section className="mt-14">
            <h2 className="font-display text-2xl text-ink">Recently published</h2>
            <p className="mt-2 text-[14px] leading-relaxed text-ink-dim">
              Titles only. The research itself opens inside the member portal.
            </p>
            <ul className="mt-5 divide-y divide-line border-y border-line">
              {recent.map((report) => (
                <li
                  key={report.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
                >
                  <span className="flex items-center gap-2 text-[15px] text-ink">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-ink-dim" aria-hidden />
                    {report.title}
                  </span>
                  <span className="font-mono text-[12px] text-ink-dim">
                    {formatDate(report.publishDate)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </ToastProvider>
  )
}
