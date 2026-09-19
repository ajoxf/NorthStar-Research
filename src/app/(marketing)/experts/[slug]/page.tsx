import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Check, ExternalLink, Lock } from 'lucide-react'

import { SectionBuy } from '@/app/(marketing)/coverage/section-buy'
import { ButtonLink } from '@/components/ui/button'
import { PreviewBanner } from '@/components/preview-banner'
import { ToastProvider } from '@/components/ui/toast'
import { db } from '@/lib/db'
import { formatPrice, type PackageShape } from '@/lib/package-shape'
import { packagesForAuthor } from '@/lib/packages'
import { packageSlugFromTrial, packageTrialSlug } from '@/lib/package-trial'
import { trialOffers } from '@/lib/trial'
import { comingSoonVisible, sectionName } from '@/lib/section-shape'
import { sectionsVisibility } from '@/lib/sections-mode'
import { formatDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const author = await db.author.findUnique({ where: { slug: params.slug } })
  if (!author) return { title: 'Subject matter expert' }
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

  /*
   * The recent list is capped at eight; the counter is not.
   *
   * Two queries rather than `recent.length`, which would have quietly read "8 reports"
   * for somebody with eighty — a figure on a marketing page understating the work by an
   * order of magnitude is still a wrong figure.
   */
  const [recent, recentCount] = await Promise.all([
    db.report.findMany({
      where: { published: true, section: { authorId: author.id } },
      orderBy: { publishDate: 'desc' },
      take: 8,
      select: { id: true, title: true, publishDate: true },
    }),
    db.report.count({ where: { published: true, section: { authorId: author.id } } }),
  ])

  /*
   * Is this person still forthcoming? The same rule the listing uses, so a card marked
   * "coming soon" and the page it leads to cannot disagree.
   */
  const soon = comingSoonVisible({
    comingSoon: author.comingSoon,
    liveSectionCount: author.sections.length,
  })

  const links = [
    { href: author.websiteUrl, label: 'Website' },
    { href: author.linkedinUrl, label: 'LinkedIn' },
    { href: author.xUrl, label: 'X' },
  ].filter((link): link is { href: string; label: string } => Boolean(link.href))

  return (
    <ToastProvider>
      {preview && <PreviewBanner />}

      {/*
        A photograph-led hero, with the portrait in its own frame rather than bled across
        the band.

        The bleed was tried and abandoned. It has to crop a wide photograph to a wide band,
        which means guessing where in the frame the subject is — and every guess is wrong
        for somebody. A centred headshot came out zoomed into the face with the scrim across
        it, because the crop assumed the subject sat on the right, as it does in the design
        this was modelled on. Those photographs are composed for the layout; an uploaded
        headshot is not, and the page has to be right for whatever arrives.

        Contained, the picture is shown whole at a portrait ratio, `object-top` so a face —
        which is nearly always in the upper half — survives the crop rather than a chin
        filling the frame.
      */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="grid-backdrop absolute inset-0 opacity-20" aria-hidden />
        <div
          className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/50 to-transparent"
          aria-hidden
        />

        <div className="relative mx-auto max-w-6xl px-5 py-14 sm:py-20">
          <Link
            href="/experts"
            className="font-mono text-[12px] text-ink-dim transition-colors hover:text-ink"
          >
            ← All experts
          </Link>

          <div className="mt-8 grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
            <div className="order-2 lg:order-1">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                  The desk
                </span>
                {[...new Set(author.sections.map((section) => section.topic.name))]
                  .slice(0, 3)
                  .map((topic) => (
                    <span
                      key={topic}
                      className="rounded-full border border-line bg-panel px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim"
                    >
                      {topic}
                    </span>
                  ))}
              </div>

              <h1 className="mt-6 text-balance font-display text-4xl leading-[1.04] text-ink sm:text-[56px]">
                {author.name}
              </h1>
              {author.headline && (
                <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-imprint sm:text-[19px]">
                  {author.headline}
                </p>
              )}

              {/*
                Two counts, and only ones that are true of this person: how many editions of
                theirs are published, and how many subjects they cover. A figure that counted
                the whole desk's output under one contributor's name would be the sort of
                claim this product cannot afford to get wrong.
              */}
              <dl className="mt-9 flex flex-wrap gap-x-14 gap-y-6">
                <div>
                  <dt className="font-display text-3xl text-ink">{recentCount}</dt>
                  <dd className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim">
                    {recentCount === 1 ? 'report' : 'reports'}
                  </dd>
                </div>
                <div>
                  <dt className="font-display text-3xl text-ink">{author.sections.length}</dt>
                  <dd className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim">
                    {author.sections.length === 1 ? 'subject' : 'subjects'}
                  </dd>
                </div>
              </dl>
            </div>

            {author.photoUrl && (
              <div className="order-1 w-full max-w-[280px] lg:order-2 lg:max-w-none">
                <div className="aspect-[4/5] overflow-hidden rounded-xl border border-line bg-panel-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- an arbitrary
                      host, which next/image would need configuring for one URL at a time. */}
                  <img
                    src={author.photoUrl}
                    alt={author.name}
                    className="h-full w-full object-cover object-top"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="bg-paper text-ink-on-light">
      <div className="mx-auto max-w-5xl px-5 py-16 sm:py-24">
        {/*
          Label left, prose right — the reference's shape, and a useful one: the biography
          is the longest text on the page and a heading above it would leave the eye with
          no idea how far it runs.
        */}
        {author.bio && (
          <section className="grid gap-6 border-b border-line-on-light pb-14 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)] sm:gap-12">
            <h2 className="font-display text-2xl font-medium leading-[1.1] tracking-[-0.03em] text-ink-on-light">
              About {author.name.split(' ')[0]}
            </h2>
            <div className="space-y-4 text-[16px] leading-[1.7] text-ink-on-light-dim">
              {author.bio
                .split('\n')
                .filter(Boolean)
                .map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
            </div>
          </section>
        )}

        {author.credentials.length > 0 && (
          <ul className="mt-8 flex flex-wrap gap-2">
            {author.credentials.map((credential) => (
              <li
                key={credential}
                className="rounded-full border border-ink-on-light/25 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-on-light-dim"
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
                className="inline-flex items-center gap-1.5 text-[14px] text-ink-on-light underline underline-offset-4"
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
            <h2 className="font-display text-[28px] font-medium leading-[1.1] tracking-[-0.03em] text-ink-on-light">
              Packages by {author.name}
            </h2>
            <p className="mt-2 text-[15px] leading-[1.7] text-ink-on-light-dim">
              {author.name} sets these prices. Card renews itself; crypto you renew when you
              choose.
            </p>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              {packages.map((pkg) => (
                <div
                  key={pkg.id}
                  className="flex flex-col rounded-2xl bg-paper-card p-6 shadow-[0_1px_2px_rgba(17,24,39,0.06)]"
                >
                  <h3 className="text-[20px] font-medium leading-[1.2] tracking-[-0.02em] text-ink-on-light">
                    {pkg.name}
                  </h3>
                  {pkg.description && (
                    <p className="mt-2 text-[14px] leading-[1.6] text-ink-on-light-dim">
                      {pkg.description}
                    </p>
                  )}

                  <div className="mt-5 flex flex-wrap items-baseline gap-x-2.5 border-t border-line-on-light pt-5">
                    <span className="font-display text-[34px] font-medium leading-none tracking-[-0.03em] text-ink-on-light">
                      {formatPrice(pkg.priceCents, pkg.currency)}
                    </span>
                    <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-on-light-dim">
                      per {pkg.interval}
                    </span>
                  </div>

                  {pkg.features.length > 0 && (
                    <ul className="mt-4 flex-1 space-y-2">
                      {pkg.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2 text-[14px] leading-[1.6] text-ink-on-light"
                        >
                          <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-ink-on-light" aria-hidden />
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
                      pkg.id === featured?.id && !trialOpen.has(pkg.slug) ? 'primary' : 'on-light'
                    }
                  >
                    Subscribe
                  </ButtonLink>
                </div>
              ))}
            </div>
          </section>
        )}

        {/*
          A forthcoming contributor, in place of the commerce.

          Shown only while they genuinely have nothing on sale — `comingSoonVisible` is the
          same rule the listing uses, so the page and the card it was reached from cannot
          disagree about whether this person is available. The moment their first subject
          goes live this disappears and the sections below take over, with nothing for an
          operator to switch off.
        */}
        {soon && (
          <section className="mt-14">
            <div className="rounded-2xl bg-paper-card p-7 shadow-[0_1px_2px_rgba(17,24,39,0.06)] sm:p-9">
              <span className="inline-flex items-center rounded-full border border-ink-on-light/35 px-4 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-ink-on-light">
                Coming soon
              </span>
              <h2 className="mt-3 font-display text-[28px] font-medium leading-[1.1] tracking-[-0.03em] text-ink-on-light">
                {author.name.split(' ')[0]} has not published here yet.
              </h2>
              <p className="mt-3 max-w-xl text-[15px] leading-[1.7] text-ink-on-light-dim">
                Their first reports are being prepared. There is nothing to subscribe to on
                this page yet — when there is, it will appear here and on the coverage page.
              </p>
              <ButtonLink href="/coverage" size="lg" variant="on-light" className="mt-6">
                See what is published today
              </ButtonLink>
            </div>
          </section>
        )}

        {author.sections.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-[28px] font-medium leading-[1.1] tracking-[-0.03em] text-ink-on-light">
            {packages.length > 0 ? 'Or just one subject' : 'Subscribe to their coverage'}
          </h2>
          <div className="mt-5 grid gap-4">
            {author.sections.map((section) => (
              <div
                key={section.id}
                className="overflow-hidden rounded-2xl bg-paper-card shadow-[0_1px_2px_rgba(17,24,39,0.06)]"
              >
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
                  <div className="min-w-0">
                    <h3 className="text-[20px] font-medium leading-[1.2] tracking-[-0.02em] text-ink-on-light">
                      {sectionName(section)}
                    </h3>
                    {section.cadence && (
                      <span className="mt-1.5 inline-block rounded-full border border-ink-on-light/20 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-on-light-dim">
                        {section.cadence}
                      </span>
                    )}
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
                  <p className="mt-3 text-[15px] leading-[1.6] text-ink-on-light-dim">
                    {section.description}
                  </p>
                )}
                <div className="mt-5">
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
        )}

        {recent.length > 0 && (
          <section className="mt-14">
            <h2 className="font-display text-[28px] font-medium leading-[1.1] tracking-[-0.03em] text-ink-on-light">
              Recently published
            </h2>
            <p className="mt-2 text-[14px] leading-[1.6] text-ink-on-light-dim">
              Titles only. The research itself opens inside the member portal.
            </p>
            <ul className="mt-5 divide-y divide-line-on-light border-y border-line-on-light">
              {recent.map((report) => (
                <li
                  key={report.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
                >
                  <span className="flex items-center gap-2 text-[15px] text-ink-on-light">
                    <Lock className="h-3.5 w-3.5 shrink-0 text-ink-on-light-dim" aria-hidden />
                    {report.title}
                  </span>
                  <span className="font-mono text-[12px] text-ink-on-light-dim">
                    {formatDate(report.publishDate)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      </div>
    </ToastProvider>
  )
}
