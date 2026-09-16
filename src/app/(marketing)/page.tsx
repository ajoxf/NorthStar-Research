import Link from 'next/link'
import { Archive, ArrowRight, Check, FileText, Smartphone } from 'lucide-react'

import { AuthorAvatar } from '@/components/author-avatar'
import { HeroMedia } from '@/components/hero-media'
import { ButtonLink } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { defaultPackage, packagesByAuthor } from '@/lib/packages'
import { packageSlugFromTrial, packageTrialSlug } from '@/lib/package-trial'
import { db } from '@/lib/db'
import { trialOffers } from '@/lib/trial'
import { sectionsPublic } from '@/lib/sections-mode'
import { formatPrice, type PackageShape } from '@/lib/package-shape'

/**
 * The price quoted here is the default package's, falling back to the built-in plan when
 * no package has been created — which is why adding admin-managed pricing changed nothing
 * on this page the day it shipped. Every figure below comes from that one object, so the
 * homepage, the join page and checkout cannot drift apart.
 */
export default async function LandingPage() {
  const [plan, offers, showSections] = await Promise.all([
    defaultPackage(),
    trialOffers(),
    sectionsPublic(),
  ])

  /*
   * The trial the buttons offer, when one is open.
   *
   * The shortest of them, because a button that names a number of days must not name one
   * somebody might not get. Null when nothing is on trial, and then every call to action
   * quotes the price instead — never a trial link to a page that 404s.
   */
  const trial = offers.length > 0
    ? offers.reduce((low, offer) => (offer.days < low.days ? offer : low))
    : null

  /*
   * The desk, when there is one to show.
   *
   * Loaded only when the sections surface is public, so this page is byte-for-byte what it
   * was until the operator turns it on — and so a half-configured contributors band is
   * never one deploy away from the front page. `sectionsPublic` is the same switch that
   * gates /coverage and /experts, deliberately: three places that could disagree about
   * whether the desk exists would be three places to remember.
   */
  const topics = showSections
    ? await db.topic.findMany({
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
    : []

  const covered = topics.filter((topic) => topic.sections.length > 0)
  const allSections = covered.flatMap((topic) => topic.sections)

  /*
   * What is on sale, and who each package belongs to.
   *
   * Loaded only when the sections surface is public, so an operator who has not turned it
   * on gets this page byte-for-byte as it was.
   */
  const sold = showSections ? await packagesByAuthor() : { house: [], authors: [] }

  /*
   * Who to name in the byline strip.
   *
   * Somebody with nothing on sale and nothing published is not yet a contributor as far as
   * a visitor is concerned — naming them promises work that cannot be read.
   */
  const contributors = sold.authors
    .filter(
      (entry) =>
        entry.packages.length > 0 ||
        allSections.some((section) => section.author.id === entry.author.id),
    )
    .map((entry) => entry.author)

  /*
   * Everything on sale, each package carrying the contributor it belongs to.
   *
   * The author is attached here rather than looked up in the card, so the card cannot
   * render a package whose contributor it failed to find. A package with no author is
   * the house's and says so — attributing it to the desk's own author record is what
   * gives it a face, and is the reason the desk is an author like any other.
   *
   * Only when the sections surface is public. Before that this whole branch is skipped
   * and the page falls back to the single membership card it has always shown.
   */
  const authorById = new Map(sold.authors.map((entry) => [entry.author.id, entry.author]))
  const onSale = showSections
    ? [...sold.house, ...sold.authors.flatMap((entry) => entry.packages)]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.priceCents - b.priceCents)
        .map((pkg) => ({
          ...pkg,
          author: pkg.authorId ? authorById.get(pkg.authorId) ?? null : null,
        }))
    : []

  /*
   * Which packages have a live trial, asked of the trial system rather than read off the
   * package's own switch — a bundle with nothing live in it has the switch on and nothing
   * to open, and a button to a page that refuses everybody is worse than no button.
   */
  const trialDaysBySlug = new Map(
    showSections
      ? offers
          .filter((offer) => offer.isPackage)
          .map((offer) => [packageSlugFromTrial(offer.slug) ?? '', offer.days] as const)
      : [],
  )

  const cheapest = allSections.reduce<number | null>(
    (low, section) => (low === null || section.priceCents < low ? section.priceCents : low),
    null,
  )

  return (
    <>
      <Hero
        plan={plan}
        trial={trial}
        hasSections={contributors.length > 0}
        packagesOnSale={onSale.length}
      />
      {contributors.length > 0 ? (
        <>
          <ContributorStrip contributors={contributors} />
          <CoverageTable sections={allSections} currency={plan.currency} />
        </>
      ) : (
        <CoverageSection />
      )}
      {/*
        Packages, when any have been created; the single membership card when none have.

        The card is what this site sold before packages existed and is still exactly right
        for a site selling one thing — so it stays as the fallback rather than being
        replaced by an empty grid. Once there are packages, the buyer picks one, and that
        choice is the whole commercial model: a payment belongs to the package it bought,
        and the package belongs to one contributor.
      */}
      {onSale.length > 0 ? (
        <PackagePricing packages={onSale} trialDaysBySlug={trialDaysBySlug} />
      ) : (
        <PricingSection plan={plan} trial={trial} cheapestSectionCents={cheapest} />
      )}
    </>
  )
}

/**
 * The people, in one line each.
 *
 * Deliberately thin. This band used to carry prices and a call to action per contributor,
 * which made it a second storefront sitting above the real one — a visitor met the same
 * names, the same faces and two different prices before reaching the packages. Selling is
 * the grid's job now, so what is left here is the claim the grid rests on: real people,
 * named, each covering what they know. The link goes to their page for anybody who wants
 * to read about them before deciding.
 */
function ContributorStrip({
  contributors,
}: {
  contributors: { id: string; slug: string; name: string; headline: string | null; photoUrl: string | null }[]
}) {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div>
            <span className="eyebrow">Written by</span>
            <h2 className="mt-2 text-balance font-display text-2xl tracking-[-0.02em] text-ink sm:text-[28px]">
              Independent experts, each covering what they know.
            </h2>
          </div>
          <Link
            href="/experts"
            className="inline-flex items-center gap-1.5 text-[14px] text-accent underline underline-offset-4"
          >
            All contributors
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>

        <ul className="mt-8 flex flex-wrap gap-x-12 gap-y-7">
          {contributors.map((contributor) => (
            <li key={contributor.id}>
              <Link
                href={`/experts/${contributor.slug}`}
                className="group flex items-center gap-3"
              >
                <AuthorAvatar name={contributor.name} photoUrl={contributor.photoUrl} size={72} />
                <span className="min-w-0">
                  <span className="block text-[15px] text-ink transition-colors group-hover:text-accent">
                    {contributor.name}
                  </span>
                  {contributor.headline && (
                    <span className="mt-0.5 block text-[13px] leading-snug text-ink-dim">
                      {contributor.headline}
                    </span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/**
 * Every subject, who writes it and what it costs, in one table.
 *
 * The card grid above is how somebody browses when they are choosing a person. This is how
 * they look when they already know the subject they want — and it is the shape that keeps
 * working at thirty sections, where thirty cards would not.
 */
function CoverageTable({
  sections,
  currency,
}: {
  sections: {
    id: string
    priceCents: number
    topic: { name: string }
    author: { name: string; slug: string }
  }[]
  currency: string
}) {
  // One row per subject, naming everybody who covers it and the cheapest way in.
  const byTopic = [...new Set(sections.map((section) => section.topic.name))].map((name) => {
    const rows = sections.filter((section) => section.topic.name === name)
    return {
      name,
      authors: [...new Set(rows.map((row) => row.author.name))],
      fromCents: Math.min(...rows.map((row) => row.priceCents)),
      href: rows.length === 1 ? `/experts/${rows[0].author.slug}` : '/coverage',
    }
  })

  return (
    <section className="border-b border-line bg-panel-2/40">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="max-w-2xl">
          <span className="eyebrow">Coverage</span>
          <h2 className="mt-3 text-balance font-display text-3xl tracking-[-0.02em] text-ink sm:text-4xl">
            Every subject, and who writes it.
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed text-ink-dim">
            Buy a single subject from a single contributor, if that is all you follow.
          </p>
        </div>

        <ul className="mt-10 divide-y divide-line border-y border-line">
          {byTopic.map((topic) => (
            <li key={topic.name}>
              <Link
                href={topic.href}
                className="group flex flex-wrap items-baseline gap-x-5 gap-y-1 py-5 transition-colors hover:bg-panel/60"
              >
                <span className="min-w-[8rem] text-[17px] text-ink">{topic.name}</span>
                <span className="flex-1 text-[14px] text-ink-dim">
                  {topic.authors.join(' · ')}
                </span>
                <span className="font-mono text-[14px] text-ink">
                  from {formatPrice(topic.fromCents, currency)}/mo
                </span>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-ink-dim transition-colors group-hover:text-accent"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>

        <Link
          href="/coverage"
          className="mt-8 inline-flex items-center gap-1.5 text-[15px] text-accent underline underline-offset-4"
        >
          See every subject and who covers it
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </section>
  )
}

/** "mo" / "yr" — the short form the CTA uses. */
function shortInterval(plan: PackageShape): string {
  return plan.interval === 'year' ? 'yr' : 'mo'
}

function Hero({
  plan,
  trial,
  hasSections,
  packagesOnSale,
}: {
  plan: PackageShape
  trial: { days: number } | null
  hasSections: boolean
  /**
   * How many packages are for sale.
   *
   * Above one, the hero stops quoting a figure. Naming one price at the top of a page that
   * sells several is the ambiguity the packages exist to remove — a visitor who reads
   * "$199" here and then finds a $49 card below has been told two different things about
   * what this costs, and neither of them is "it depends which you pick".
   */
  packagesOnSale: number
}) {
  return (
    <section className="relative overflow-hidden border-b border-line">
      {/* The still is the default. Setting NEXT_PUBLIC_HERO_VIDEO_URL replaces it with
          footage; the still then serves as that video's poster, so the first paint is the
          same either way. */}
      <HeroMedia
        image="/hero-desk.jpg"
        videoSrc={process.env.NEXT_PUBLIC_HERO_VIDEO_URL}
        videoPoster={process.env.NEXT_PUBLIC_HERO_POSTER_URL}
      />
      {/* Behind the photograph, so the hero still reads as designed if the image is ever
          missing rather than collapsing to an empty black band. */}
      <div className="grid-backdrop absolute inset-0 -z-10 opacity-20" aria-hidden />
      <div
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent"
        aria-hidden
      />

      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:py-36 lg:py-44">
        <div className="max-w-2xl animate-fade-up lg:max-w-[52%]">
          <Badge tone="accent" className="mb-6">
            Three reports · Every week
          </Badge>

          {/* Oversized and tightly tracked, per the reference: the headline is the
              design, so it runs larger and closer than a default type scale would. It
              steps back down at the large breakpoint, where the photograph takes the
              right of the frame and the headline has half the width to live in. */}
          <h1 className="text-balance font-display text-[2.75rem] font-semibold tracking-[-0.035em] text-ink sm:text-6xl md:text-7xl lg:text-[3.5rem] xl:text-[4rem]">
            Independent technical and macro research.
          </h1>

          <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-ink-dim">
            NordStar Pro publishes three reports a week, covering commodities, international
            markets and indices, options, crypto and spreads, and FX. Each one sets out the
            technical structure and the macro context behind it, with the reasoning shown. No
            noise and no upsells.{' '}
            {hasSections
              ? 'Take the whole desk, or just the expert you follow.'
              : 'One price.'}
          </p>

          {/* Icon + uppercase meta row, sitting between the copy and the actions. */}
          <ul className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-3">
            {[
              { icon: FileText, label: '3 reports / week' },
              { icon: Archive, label: 'Full archive' },
              { icon: Smartphone, label: 'Mobile friendly' },
            ].map((item) => (
              <li key={item.label} className="flex items-center gap-2">
                <item.icon className="h-3.5 w-3.5 text-accent" aria-hidden />
                <span className="text-[12px] font-medium uppercase tracking-[0.14em] text-ink">
                  {item.label}
                </span>
              </li>
            ))}
          </ul>

          {/*
            The trial leads when there is one, and the price sits beside it rather than
            behind it. Somebody who has already decided should not have to start a trial to
            find out what it costs — that is the same wait a pricing request used to impose,
            dressed differently.
          */}
          {/*
            Two tracks of equal width, rather than two buttons each sized to its own label.

            A grid and not flex-wrap, because the labels are different lengths and always
            will be — the trial names a number of days an operator can change. Equal `1fr`
            tracks in a shrink-to-fit grid settle at the wider of the two whatever those
            labels say, so nobody has to keep a hand-tuned width in step with the copy.

            One column below `sm`, where side by side would either wrap mid-label or force
            a horizontal scroll on a phone.
          */}
          {trial ? (
            <div className="mt-9 grid max-w-md grid-cols-1 gap-3 sm:inline-grid sm:max-w-none sm:grid-cols-2">
              <ButtonLink href="/trial" size="lg">
                Start a free {trial.days}-day trial
                <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
              <ButtonLink href={packagesOnSale > 1 ? '#pricing' : '/join'} size="lg" variant="secondary">
                {packagesOnSale > 1
                  ? 'See the packages'
                  : `Join — ${formatPrice(plan.priceCents, plan.currency)}/${shortInterval(plan)}`}
              </ButtonLink>
            </div>
          ) : (
            <div className="mt-9">
              <ButtonLink href={packagesOnSale > 1 ? '#pricing' : '/join'} size="lg">
                {packagesOnSale > 1
                  ? 'Choose your package'
                  : `Become a member — ${formatPrice(plan.priceCents, plan.currency)}/${shortInterval(plan)} intro`}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

const COVERAGE = [
  {
    title: 'Commodities & Energy',
    analysis:
      'Precious and base metals, crude and natural gas, read through trend structure and the macro backdrop driving them.',
  },
  {
    title: 'Indices & FX',
    analysis:
      'Global equity indices and major currency pairs, with cross-market rotation, rate differentials and positioning.',
  },
  {
    title: 'Options, Crypto & Spreads',
    analysis:
      'Defined-risk option structures, digital assets and relative-value spreads, framed as scenarios rather than calls.',
  },
]

function CoverageSection() {
  return (
    <section className="border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="max-w-2xl">
          <span className="eyebrow">Coverage</span>
          <h2 className="mt-3 text-balance font-display text-3xl tracking-[-0.02em] text-ink sm:text-4xl">
            Every edition works the same way.
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed text-ink-dim">
            Charts first. Technical structure read against the macro backdrop, with the
            reasoning shown — so you can weigh it against your own view rather than take it
            on trust.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {COVERAGE.map((card) => (
            <div
              key={card.title}
              className="flex flex-col rounded-lg border border-line bg-panel p-6 transition-colors hover:border-accent/40"
            >
              <h3 className="text-[18px] text-ink">{card.title}</h3>
              <p className="mt-2 flex-1 text-[14px] leading-relaxed text-ink-dim">
                {card.analysis}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * The packages on sale, each under the face of whoever writes it.
 *
 * This is the commercial model made visible: a buyer picks a package, and the money from
 * that sale belongs to the one contributor the package is attributed to. No splitting, no
 * percentages to agree — which is why a package has exactly one author and why choosing a
 * package, rather than choosing a subscription and sorting out attribution afterwards, is
 * the flow the whole thing rests on.
 *
 * The contributor's name is shown from their record rather than baked into the package
 * name, so renaming somebody renames them everywhere at once.
 */
function PackagePricing({
  packages,
  trialDaysBySlug,
}: {
  packages: (PackageShape & {
    author: { name: string; slug: string; photoUrl: string | null } | null
  })[]
  trialDaysBySlug: Map<string, number>
}) {
  return (
    <section id="pricing" className="border-t border-line">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <span className="eyebrow">Pricing</span>
          <h2 className="mt-3 text-balance font-display text-3xl tracking-[-0.02em] text-ink sm:text-4xl">
            Choose your package.
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed text-ink-dim">
            Each one is written by the contributor whose name is on it, and priced by them.
            Pay by card and it renews itself — cancel any time — or pay in crypto and renew
            whenever you choose.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg) => {
            const trialDays = trialDaysBySlug.get(pkg.slug)
            return (
              <div key={pkg.id} className="panel flex flex-col p-6">
                {/* The face first. Whose work this is comes before what it costs. */}
                <div className="flex items-center gap-3">
                  <AuthorAvatar
                    name={pkg.author?.name ?? 'NordStar Pro'}
                    photoUrl={pkg.author?.photoUrl ?? null}
                    size={64}
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
                      {pkg.author ? 'Written by' : 'The desk'}
                    </p>
                    <p className="mt-0.5 truncate text-[14px] text-ink">
                      {pkg.author?.name ?? 'NordStar Pro'}
                    </p>
                  </div>
                </div>

                <h3 className="mt-5 font-display text-xl text-ink">{pkg.name}</h3>
                {pkg.description && (
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-dim">{pkg.description}</p>
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

                {/* Trial first where one is open; the price is above both, so neither
                    button is hiding a figure from anybody. */}
                {trialDays !== undefined && (
                  <ButtonLink
                    href={`/trial?item=${encodeURIComponent(packageTrialSlug(pkg.slug))}`}
                    size="lg"
                    className="mt-6 w-full"
                  >
                    Try {trialDays} days free
                  </ButtonLink>
                )}

                <ButtonLink
                  href={`/join?package=${pkg.slug}`}
                  size="lg"
                  variant={trialDays !== undefined ? 'secondary' : 'primary'}
                  className={trialDays !== undefined ? 'mt-3 w-full' : 'mt-6 w-full'}
                >
                  Subscribe
                </ButtonLink>

                {pkg.author && (
                  <Link
                    href={`/experts/${pkg.author.slug}`}
                    className="mt-3 text-center text-[13px] text-ink-dim underline underline-offset-4 hover:text-ink"
                  >
                    About {pkg.author.name}
                  </Link>
                )}
              </div>
            )
          })}
        </div>

        <p className="mt-8 text-center text-[13px] text-ink-dim">
          Already paid?{' '}
          <Link href="/redeem" className="text-accent underline underline-offset-4">
            Redeem your code
          </Link>
        </p>
      </div>
    </section>
  )
}

function PricingSection({
  plan,
  trial,
  cheapestSectionCents,
}: {
  plan: PackageShape
  trial: { days: number } | null
  /** Lowest live section price, or null when sections are off or none are on sale. */
  cheapestSectionCents: number | null
}) {
  return (
    <section id="pricing">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="panel relative mx-auto max-w-xl overflow-hidden p-8 sm:p-10">
          <div
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent"
            aria-hidden
          />

          <span className="eyebrow">Membership</span>

          <div className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-2">
            <span className="font-display text-5xl text-ink">
              {formatPrice(plan.priceCents, plan.currency)}
            </span>
            <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-dim">
              per {plan.interval}
            </span>
            {/*
              Stated as a fact about the current price, not as a countdown. No fake
              deadline, no struck-through "was" figure that never existed — both are the
              kind of pressure a research product should not need, and the second is a
              claim we would have to be able to stand behind.
            */}
            <Badge tone="accent">Introductory rate</Badge>
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-dim">
            One plan. Three reports a week, the complete archive of everything published, and an
            email the moment each one lands. Pay by card and it renews itself — cancel any time —
            or pay in crypto and renew whenever you choose.
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-ink-dim">
            <span className="text-ink">
              {formatPrice(plan.priceCents, plan.currency)} is an introductory rate
            </span>{' '}
            while the desk builds out its coverage. It will rise for new members later; join now
            and yours stays as it is for as long as your membership runs.
          </p>

          {/*
            Noun phrases, one fact each. The first two are deliberately parallel — new
            against past — because together they are the whole offer: everything from here
            on, and everything before it.

            "Cancel any time" is not on the payment line. It is true of a card
            subscription and meaningless for crypto, where there is nothing on file to
            cancel and you simply do not renew — which is what the FAQ says, and a bullet
            promising a cancellation that does not exist is the kind of small untruth a
            reader finds out about at exactly the wrong moment.
          */}
          <ul className="mt-8 space-y-3 border-t border-line pt-7">
            {[
              'Three new reports every week',
              'Full archive of every past report',
              'Mobile-ready reading view',
              'Emailed the moment each report lands',
              'Pay by card or in crypto — no lock-in',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-[15px] text-ink">
                <Check className="h-4 w-4 shrink-0 text-up" aria-hidden />
                {item}
              </li>
            ))}
          </ul>

          {/* Trial first where there is one, payment underneath. The price is directly
              above both, so neither button is hiding a figure from anybody. */}
          {trial && (
            <ButtonLink href="/trial" size="lg" className="mt-9 w-full">
              Start a free {trial.days}-day trial
              <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
          )}

          <ButtonLink
            href="/join"
            size="lg"
            variant={trial ? 'secondary' : 'primary'}
            className={trial ? 'mt-3 w-full' : 'mt-9 w-full'}
          >
            Continue to payment
            {!trial && <ArrowRight className="h-4 w-4" aria-hidden />}
          </ButtonLink>

          {/*
            A second door, not a replacement.
            
            The card above is unchanged — this is the all-access plan and the people on it
            keep it. Sections sit underneath as an additional route, priced from the
            cheapest one actually on sale rather than from a figure typed in here.
          */}
          {cheapestSectionCents !== null && (
            <p className="mt-6 border-t border-line pt-6 text-center text-[14px] leading-relaxed text-ink-dim">
              Only follow one subject?{' '}
              <Link href="/coverage" className="text-accent underline underline-offset-4">
                Subscribe to a single expert from{' '}
                {formatPrice(cheapestSectionCents, plan.currency)}/month
              </Link>
            </p>
          )}

          <p className="mt-4 text-center text-[13px] text-ink-dim">
            Already paid?{' '}
            <Link href="/redeem" className="text-accent underline underline-offset-4">
              Redeem your code
            </Link>
          </p>
        </div>
      </div>
    </section>
  )
}
