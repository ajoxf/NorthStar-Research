import Link from 'next/link'
import { Archive, ArrowRight, Check, FileText, Smartphone } from 'lucide-react'

import { AuthorAvatar } from '@/components/author-avatar'
import { Band, BandHeading, Eyebrow } from '@/components/band'
import { HeroMedia } from '@/components/hero-media'
import { ButtonLink } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { defaultPackage, packagesByAuthor } from '@/lib/packages'
import { packageSlugFromTrial, packageTrialSlug } from '@/lib/package-trial'
import { authorListable, comingSoonVisible } from '@/lib/section-shape'
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
    .map((entry) => {
      const mine = allSections.filter((section) => section.author.id === entry.author.id)
      const prices = [
        ...entry.packages.map((pkg) => pkg.priceCents),
        ...mine.map((section) => section.priceCents),
      ]
      return {
        ...entry.author,
        hasPackages: entry.packages.length > 0,
        liveSectionCount: mine.length,
        /*
         * The subjects this person writes, named under their photograph.
         *
         * A face and a price told a visitor who somebody is and what they cost, and not
         * what they actually write about — which is the thing being sold. Topic names
         * rather than full section names, because "Energy by Dean Rogers" under a card
         * headed "Dean Rogers" says his name twice and the subject once.
         */
        subjects: [...new Set(mine.map((section) => section.topic.name))],
        // The cheapest way in, across packages and single subjects alike.
        fromCents: prices.length > 0 ? Math.min(...prices) : null,
        soon: comingSoonVisible({
          comingSoon: entry.author.comingSoon,
          liveSectionCount: mine.length,
        }),
      }
    })
    .filter(
      (entry) =>
        entry.hasPackages ||
        authorListable({ comingSoon: entry.comingSoon, liveSectionCount: entry.liveSectionCount }),
    )
    // Somebody you can read today leads; somebody announced follows.
    .sort((a, b) => Number(a.soon) - Number(b.soon))

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
      {/*
        The bands alternate, and the order is what makes them do so: dark hero, light
        subjects, dark contributors, light prices, lime close. Two light bands in a row
        would flatten the whole page, which is the one thing this rhythm exists to avoid —
        so the order here is load-bearing, not arrangement.
      */}
      {contributors.length > 0 ? (
        <>
          <CoverageTable sections={allSections} currency={plan.currency} />
          <ContributorStrip contributors={contributors} currency={plan.currency} />
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
      <LimeStrip trial={trial} />
    </>
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
          {/* No cadence here. Each subject publishes at its own rate and says so on its
              own card; a figure in the hero would be a promise made on behalf of every
              expert on the site, including the ones who have not joined yet. */}
          <Badge tone="accent" className="mb-6">
            Technical · Macro · Independent
          </Badge>

          {/* Oversized and tightly tracked, per the reference: the headline is the
              design, so it runs larger and closer than a default type scale would. It
              steps back down at the large breakpoint, where the photograph takes the
              right of the frame and the headline has half the width to live in. */}
          <h1 className="text-balance font-display text-[2.75rem] font-semibold tracking-[-0.035em] text-ink sm:text-6xl md:text-7xl lg:text-[3.5rem] xl:text-[4rem]">
            Independent technical and macro research.
          </h1>

          <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-ink-dim">
            NordStar Pro brings insight on commodities, FX, global indices, AI and related
            financial markets — written by experienced industry practitioners, with the
            reasoning shown rather than the conclusion asserted.{' '}
            {hasSections
              ? 'Every subject has one author, and you subscribe to the ones you follow.'
              : 'One membership, one price.'}
          </p>

          {/* Icon + uppercase meta row, sitting between the copy and the actions. */}
          <ul className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-3">
            {[
              // Not a number. Each subject sets its own cadence and says so on its own
              // card — a figure here would be a promise made on behalf of every expert.
              { icon: FileText, label: 'Independent research' },
              // "Full archive" read as the whole site's. What a subscriber gets is every
              // past edition of what they bought, which is what this now says.
              { icon: Archive, label: 'Archive included' },
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
                {/* The length belongs to the offer, not the button. It is on the trial
                    page itself and in the strip at the foot, where there is room for it
                    to read as a sentence rather than crowd a call to action. */}
                Start Trial
                <ArrowRight className="h-4 w-4" aria-hidden />
              </ButtonLink>
              {/*
                One package is still a choice to make, not a price to accept.

                This asked for more than one, so a site selling a single package sent
                people to a button naming a figure — and when there are no packages at
                all that figure is the built-in membership, which is the all-access plan
                this site no longer sells. The same off-by-one as the subscriptions band:
                the threshold was written for a site with several contributors and is
                wrong for the state every site passes through on its way there.
              */}
              <ButtonLink href={packagesOnSale > 0 ? '#pricing' : '/join'} size="lg" variant="secondary">
                {packagesOnSale > 0
                  ? 'See the packages'
                  : `Join — ${formatPrice(plan.priceCents, plan.currency)}/${shortInterval(plan)}`}
              </ButtonLink>
            </div>
          ) : (
            <div className="mt-9">
              <ButtonLink href={packagesOnSale > 0 ? '#pricing' : '/join'} size="lg">
                {packagesOnSale > 0
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

/**
 * The people, in one line each.
 *
 * Faces, names and the price of getting in — one figure each, not a card of options.
 *
 * This band once carried a full price block and a call to action per person, which made
 * it a second storefront above the real one: the same names met twice, with two different
 * prices, before reaching anything buyable. It was cut back to names only, and that went
 * too far the other way — somebody comparing four experts is comparing cost as much as
 * coverage, and making them open four profiles to find out is friction this grid exists to
 * remove. So: one "from" figure, and the packages themselves still live further down.
 */
function ContributorStrip({
  contributors,
  currency,
}: {
  contributors: {
    id: string
    slug: string
    name: string
    headline: string | null
    photoUrl: string | null
    /** The lowest price at which this person can be read. Null while nothing is on sale. */
    fromCents: number | null
    /** The subjects they write, shown under the name. */
    subjects: string[]
    /** Announced but not yet publishing. Labelled rather than quietly listed. */
    soon: boolean
  }[]
  currency: string
}) {
  return (
    <Band tone="dark">
      {/*
        Left, like every other band on the site.

        The headers here were centred while the contributor pages, the coverage page and
        the member portal all set theirs to the left — the same page furniture arranged two
        different ways depending which route somebody took. Left also gives the paragraph a
        natural measure instead of a centred block that has to be width-capped by hand.
      */}
      <div className="max-w-2xl">
        <Eyebrow tone="dark">Subject matter experts</Eyebrow>
        <BandHeading className="mt-4">Authored by industry practitioners.</BandHeading>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-dim">
          Every report is attributed to a named analyst and published under their own
          coverage. Those currently publishing are listed below, with the markets each
          covers.
        </p>
      </div>

      {/*
        Portrait cards, matching the contributors page — the same people should not be a
        grid of faces in one place and a list of names in another.
      */}
      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {contributors.slice(0, 4).map((contributor) => (
          <Link
            key={contributor.id}
            href={`/experts/${contributor.slug}`}
            className="group relative block aspect-[3/4] overflow-hidden rounded-2xl border border-line bg-panel-2 transition-colors hover:border-accent/45"
          >
            {contributor.photoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element -- an arbitrary host,
                 which next/image would need configuring for one URL at a time. */
              <img
                src={contributor.photoUrl}
                alt=""
                className="absolute inset-0 h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
                loading="lazy"
              />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center">
                <AuthorAvatar name={contributor.name} photoUrl={null} size={96} />
              </span>
            )}

            <div
              className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black via-black/75 to-transparent"
              aria-hidden
            />

            <div className="absolute inset-x-0 bottom-0 p-5">
              {contributor.soon && (
                <span className="mb-2 inline-block rounded-full border border-accent/50 bg-accent/15 px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-accent backdrop-blur-sm">
                  Coming soon
                </span>
              )}
              <h3 className="font-display text-[17px] leading-snug text-white">
                {contributor.name}
              </h3>
              {contributor.headline && (
                <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-white/70">
                  {contributor.headline}
                </p>
              )}
              {/* What they write, under who they are. Two at most: the card is a
                  portrait, and a fourth pill pushes the price off the bottom of it. */}
              {contributor.subjects.length > 0 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {contributor.subjects.slice(0, 2).map((subject) => (
                    <span
                      key={subject}
                      className="rounded-full border border-white/25 bg-black/40 px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] text-white/85 backdrop-blur-sm"
                    >
                      {subject}
                    </span>
                  ))}
                </div>
              )}
              {/* The price belongs on the card — see the note on the experts listing. */}
              {!contributor.soon && contributor.fromCents !== null && (
                <p className="mt-2 text-[14px] text-white">
                  from{' '}
                  <span className="font-medium">
                    {formatPrice(contributor.fromCents, currency)}
                  </span>
                  <span className="text-white/70">/mo</span>
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-10">
        <ButtonLink href="/experts" size="lg" variant="secondary">
          View all experts
        </ButtonLink>
      </div>
    </Band>
  )
}

/**
 * Every subject, who writes it and what it costs.
 *
 * On the light ground, as the reference puts its catalogue: white cards on grey, which is
 * what separates "here is the shelf" from the dark bands either side of it. Cards rather
 * than the table this used to be — a table of three rows reads as a spreadsheet, and this
 * is the first thing on the page that a buyer is meant to want.
 */
function CoverageTable({
  sections,
  currency,
}: {
  sections: {
    id: string
    priceCents: number
    imageUrl: string | null
    topic: { name: string }
    author: { name: string; slug: string }
  }[]
  currency: string
}) {
  // One card per subject, naming everybody who covers it and the cheapest way in.
  const byTopic = [...new Set(sections.map((section) => section.topic.name))].map((name) => {
    const rows = sections.filter((section) => section.topic.name === name)
    return {
      name,
      authors: [...new Set(rows.map((row) => row.author.name))],
      fromCents: Math.min(...rows.map((row) => row.priceCents)),
      image: rows.find((row) => row.imageUrl)?.imageUrl ?? null,
      href: rows.length === 1 ? `/experts/${rows[0].author.slug}` : '/coverage',
    }
  })

  return (
    <Band tone="light">
      <div className="max-w-2xl">
        <Eyebrow tone="light">Featured</Eyebrow>
        <BandHeading className="mt-4">Research coverage.</BandHeading>
        <p className="mt-4 text-[16px] leading-[1.7] text-ink-on-light-dim">
          Subscribe to an individual subject, or to a package spanning several. Every
          subscription includes the complete archive of previously published editions.
        </p>
      </div>

      <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {byTopic.map((topic) => (
          <Link
            key={topic.name}
            href={topic.href}
            className="group flex flex-col overflow-hidden rounded-2xl bg-paper-card shadow-[0_1px_2px_rgba(17,24,39,0.06)] transition-shadow hover:shadow-[0_8px_24px_rgba(17,24,39,0.10)]"
          >
            {topic.image && (
              <div className="aspect-[16/9] w-full overflow-hidden bg-paper">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={topic.image}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  loading="lazy"
                />
              </div>
            )}

            <div className="flex flex-1 flex-col p-6">
              <h3 className="text-[20px] font-medium leading-[1.2] tracking-[-0.02em] text-ink-on-light">
                {topic.name}
              </h3>
              <p className="mt-2 flex-1 text-[14px] leading-[1.6] text-ink-on-light-dim">
                {topic.authors.join(' · ')}
              </p>

              <div className="mt-5 flex items-center justify-between border-t border-line-on-light pt-4">
                <span className="text-[15px] text-ink-on-light">
                  from{' '}
                  <span className="font-medium">{formatPrice(topic.fromCents, currency)}</span>
                  <span className="text-ink-on-light-dim">/mo</span>
                </span>
                <ArrowRight
                  className="h-4 w-4 text-ink-on-light-dim transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-10">
        <ButtonLink href="/coverage" size="lg" variant="on-light">
          See every subject
        </ButtonLink>
      </div>
    </Band>
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
    <Band tone="light">
      <div className="max-w-2xl">
        <Eyebrow tone="light">Coverage</Eyebrow>
        <BandHeading className="mt-4">Every edition works the same way.</BandHeading>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-on-light-dim">
          Charts first. Technical structure read against the macro backdrop, with the
          reasoning shown — so you can weigh it against your own view rather than take it
          on trust.
        </p>
      </div>

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {COVERAGE.map((card) => (
          <div
            key={card.title}
            className="flex flex-col rounded-2xl bg-paper-card p-6 shadow-[0_1px_2px_rgba(17,24,39,0.06)]"
          >
            <h3 className="text-[20px] font-medium leading-[1.2] tracking-[-0.02em] text-ink-on-light">
              {card.title}
            </h3>
            <p className="mt-2.5 flex-1 text-[15px] leading-[1.6] text-ink-on-light-dim">
              {card.analysis}
            </p>
          </div>
        ))}
      </div>
    </Band>
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
    <Band tone="light" id="pricing">
      <div>
        <div className="max-w-2xl">
          <Eyebrow tone="light">Pricing</Eyebrow>
          <BandHeading className="mt-4">Subscription plans.</BandHeading>
          <p className="mt-4 text-[16px] leading-[1.7] text-ink-on-light-dim">
            Each package is priced by the analyst who authors it. Card subscriptions renew
            automatically and may be cancelled at any time; cryptocurrency subscriptions are
            renewed at your discretion. Access credentials are issued by email once payment
            is confirmed.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg) => {
            const trialDays = trialDaysBySlug.get(pkg.slug)
            return (
              <div
                key={pkg.id}
                className="flex flex-col overflow-hidden rounded-2xl bg-paper-card shadow-[0_1px_2px_rgba(17,24,39,0.06)]"
              >
                {/*
                  The package's artwork, above the face rather than instead of it. The
                  avatar answers "whose is this"; the picture answers "what is it about",
                  and a card selling a subject wants both.
                */}
                {pkg.imageUrl && (
                  <div className="aspect-[16/10] w-full overflow-hidden bg-paper">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pkg.imageUrl}
                      alt=""
                      className="h-full w-full object-cover object-top"
                      loading="lazy"
                    />
                  </div>
                )}
                <div className="flex flex-1 flex-col p-6">
                {/* The face first. Whose work this is comes before what it costs. */}
                <div className="flex items-center gap-3">
                  <AuthorAvatar
                    name={pkg.author?.name ?? 'NordStar Pro'}
                    photoUrl={pkg.author?.photoUrl ?? null}
                    size={64}
                  />
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-on-light-dim">
                      {pkg.author ? 'Written by' : 'The desk'}
                    </p>
                    <p className="mt-0.5 truncate text-[14px] text-ink-on-light">
                      {pkg.author?.name ?? 'NordStar Pro'}
                    </p>
                  </div>
                </div>

                <h3 className="mt-5 text-[20px] font-medium leading-[1.2] tracking-[-0.02em] text-ink-on-light">
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
                  // On a white card, `secondary` would draw white on white. The light-ground
                  // pair is the whole reason those variants exist.
                  variant={trialDays !== undefined ? 'on-light' : 'primary'}
                  className={trialDays !== undefined ? 'mt-3 w-full' : 'mt-6 w-full'}
                >
                  Subscribe
                </ButtonLink>

                {pkg.author && (
                  <Link
                    href={`/experts/${pkg.author.slug}`}
                    className="mt-3 text-center text-[13px] text-ink-on-light-dim underline underline-offset-4 hover:text-ink-on-light"
                  >
                    About {pkg.author.name}
                  </Link>
                )}
                </div>
              </div>
            )
          })}
        </div>

        <p className="mt-8 text-center text-[13px] text-ink-on-light-dim">
          Already paid?{' '}
          <Link
            href="/redeem"
            className="text-ink-on-light underline underline-offset-4"
          >
            Redeem your code
          </Link>
        </p>
      </div>
    </Band>
  )
}

/**
 * The closing strip, in the accent.
 *
 * The loudest thing on the page, and the last: one sentence about what arrives and one
 * button. It works because there is exactly one of it — a second lime band anywhere would
 * cost this one everything it has.
 */
/**
 * The closing strip, arguing for the button beside it.
 *
 * It used to say "Independent technical and macro trends, from the experts who follow
 * them" — the hero's own headline, repeated at the foot of the page to somebody who has
 * just scrolled past everything it introduces. A closing line has one job, and restating
 * the opening one is not it.
 *
 * The line now depends on which button is actually shown. With a trial open, the argument
 * is that there is nothing to lose by reading first; without one, it is what a
 * subscription actually gets you. A fixed line could only ever be right for one of those,
 * and was right for neither.
 */
function LimeStrip({ trial }: { trial: { days: number } | null }) {
  return (
    <Band tone="lime" innerClassName="py-14 sm:py-16">
      <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center">
        <p className="max-w-xl text-balance font-display text-[26px] font-medium leading-[1.15] tracking-[-0.03em] text-ink-on-light sm:text-[32px]">
          {trial
            ? `Evaluate the research for ${trial.days} days at no cost.`
            : 'Subscribe to the coverage you follow.'}
        </p>
        <ButtonLink href={trial ? '/trial' : '/join'} size="lg" variant="on-light-solid" className="shrink-0">
          {trial ? 'Start Trial' : 'Become a member'}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </ButtonLink>
      </div>
    </Band>
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
            One plan. Every report the desk publishes, the complete archive of everything
            published before it, and an email the moment each one lands. Pay by card and it
            renews itself — cancel any time — or pay in crypto and renew whenever you choose.
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
              'Every new report as it publishes',
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
              Start Trial
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
