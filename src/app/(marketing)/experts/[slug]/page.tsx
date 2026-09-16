import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Check, ExternalLink, Lock } from 'lucide-react'

import { SectionBuy } from '@/app/(marketing)/coverage/section-buy'
import { AuthorAvatar } from '@/components/author-avatar'
import { ButtonLink } from '@/components/ui/button'
import { PreviewBanner } from '@/components/preview-banner'
import { ToastProvider } from '@/components/ui/toast'
import { db } from '@/lib/db'
import { formatPrice, type PackageShape } from '@/lib/package-shape'
import { packagesForAuthor } from '@/lib/packages'
import { packageSlugFromTrial, packageTrialSlug } from '@/lib/package-trial'
import { trialOffers } from '@/lib/trial'
import { sectionName } from '@/lib/section-shape'
import { sectionsVisibility } from '@/lib/sections-mode'
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
  const { visible, preview } = await sectionsVisibility()
  if (!visible) notFound()

  const author = await db.author.findUnique({
    where: { slug: params.slug },
    include: {
      sections: {
        where: { archivedAt: null },
        orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
        include: { topic: true, author: true, item: { select: { slug: true } } },
      },
    },
  })

  if (!author || author.archivedAt !== null) notFound()

  /*
   * What this contributor sells, in the order the admin put them in.
   *
   * The fullest one — their dearest — carries the solid button, rather than a hand-picked
   * "most popular" badge: there is no popularity data to base that claim on, and inventing
   * one is the kind of small untruth a research product should not be built on. It is a
   * visual emphasis only; every package on the page is one click to buy.
   */
  const packages = await packagesForAuthor(author.id)

  /*
   * Which of those packages a trial is actually open on, and for how many days.
   *
   * Asked of the trial system rather than read off `pkg.trialEnabled`, because the switch
   * and the offer are not the same thing: a package whose sections have all been archived
   * has the switch on and nothing to open, and `trialOffers` is the one place that knows
   * the difference. Keyed by package slug, the offer slug being the prefixed form.
   */
  const openOffers = await trialOffers()
  const trialOpen = new Map(
    openOffers
      .filter((offer) => offer.isPackage)
      .map((offer) => [packageSlugFromTrial(offer.slug) ?? '', offer.days] as const),
  )
  /** The same question for individual subjects, keyed by item slug. */
  const sectionTrials = new Map(
    openOffers.filter((offer) => offer.isSection).map((offer) => [offer.slug, offer.days] as const),
  )
  const featured = packages.reduce<PackageShape | null>(
    (low, pkg) => (low === null || pkg.priceCents > low.priceCents ? pkg : low),
    null,
  )

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
      {preview && <PreviewBanner />}
      <div className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
        <Link
          href="/experts"
          className="font-mono text-[12px] text-ink-dim hover:text-ink"
        >
          ← All contributors
        </Link>

        {/*
          The portrait is the page's opening image, not a bullet next to the name.

          It was 84px, which on a page whose whole argument is "a named person with a
          record stands behind this research" made the person the smallest thing on it.
          Two sizes rather than one: 128 on a phone, where a 176px circle would push the
          name off the first screen, and 176 from `sm` up.
        */}
        <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-8">
          <div className="sm:hidden">
            <AuthorAvatar name={author.name} photoUrl={author.photoUrl} size={128} />
          </div>
          <div className="hidden sm:block">
            <AuthorAvatar name={author.name} photoUrl={author.photoUrl} size={176} />
          </div>
          <div className="min-w-0">
            <h1 className="text-balance text-3xl leading-tight text-ink sm:text-4xl">
              {author.name}
            </h1>
            {author.headline && (
              <p className="mt-2.5 text-[17px] leading-relaxed text-imprint">{author.headline}</p>
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

        {/*
          This contributor's own prices, above the per-section list.

          The site no longer has one price: each contributor's packages are set for them
          in the admin, and this is where a buyer meets them. The section list below stays
          as the finer-grained option — a package is usually several sections at a keener
          price, and somebody who only follows one subject should still be able to say so.
        */}
        {packages.length > 0 && (
          <section className="mt-14">
            <h2 className="font-display text-2xl text-ink">
              Packages by {author.name}
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-ink-dim">
              {author.name} sets these prices. Card renews itself; crypto you renew when you
              choose.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {packages.map((pkg) => (
                <div key={pkg.id} className="panel flex flex-col p-6">
                  <h3 className="font-display text-xl text-ink">{pkg.name}</h3>
                  {pkg.description && (
                    <p className="mt-2 text-[14px] leading-relaxed text-ink-dim">
                      {pkg.description}
                    </p>
                  )}

                  <div className="mt-5 flex flex-wrap items-baseline gap-x-2.5 border-t border-line pt-5">
                    <span className="font-display text-3xl text-ink">
                      {formatPrice(pkg.priceCents, pkg.currency)}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim">
                      per {pkg.interval}
                    </span>
                  </div>

                  {pkg.features.length > 0 && (
                    <ul className="mt-4 flex-1 space-y-2">
                      {pkg.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-[14px] text-ink">
                          <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-up" aria-hidden />
                          {feature}
                        </li>
                      ))}
                    </ul>
                  )}

                  {/*
                    The trial leads where one is open, with payment underneath rather than
                    behind it — the price is already on the card above, so neither button
                    is hiding a figure from anybody.

                    `trialOpen` is the offer as the trial system sees it, not the package's
                    own switch: a bundle with nothing live in it has the switch on and no
                    offer, and a button to a page that refuses everybody is worse than no
                    button.
                  */}
                  {trialOpen.has(pkg.slug) && (
                    <ButtonLink
                      href={`/trial?item=${encodeURIComponent(packageTrialSlug(pkg.slug))}`}
                      size="lg"
                      className="mt-6 w-full"
                    >
                      Try {trialOpen.get(pkg.slug)} days free
                    </ButtonLink>
                  )}

                  <ButtonLink
                    href={`/join?package=${pkg.slug}`}
                    size="lg"
                    className={trialOpen.has(pkg.slug) ? 'mt-3 w-full' : 'mt-6 w-full'}
                    variant={
                      pkg.id === featured?.id && !trialOpen.has(pkg.slug) ? 'primary' : 'secondary'
                    }
                  >
                    Subscribe
                  </ButtonLink>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-14">
          <h2 className="font-display text-2xl text-ink">
            {packages.length > 0 ? 'Or just one subject' : 'Subscribe to their coverage'}
          </h2>
          <div className="mt-5 grid gap-4">
            {author.sections.map((section) => (
              <div key={section.id} className="panel overflow-hidden">
                {/* The subject's own picture, matching the coverage page. */}
                {section.imageUrl && (
                  <div className="aspect-[21/9] w-full overflow-hidden border-b border-line bg-panel-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={section.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                )}
                <div className="p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h3 className="font-display text-xl text-ink">{sectionName(section)}</h3>
                  <span className="shrink-0 text-right">
                    <span className="block font-display text-2xl leading-none text-ink">
                      {formatPrice(section.priceCents, section.currency)}
                    </span>
                    <span className="mt-1 block font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim">
                      per {section.interval}
                    </span>
                  </span>
                </div>
                {section.description && (
                  <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
                    {section.description}
                  </p>
                )}
                <div className="mt-5">
                  <SectionBuy
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
