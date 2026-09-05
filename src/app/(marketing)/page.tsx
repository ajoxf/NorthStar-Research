import Link from 'next/link'
import { Archive, ArrowRight, Check, FileText, Lock, Smartphone } from 'lucide-react'

import { SampleReportForm } from '@/app/(marketing)/sample-report-form'
import { AuthorAvatar } from '@/components/author-avatar'
import { HeroMedia } from '@/components/hero-media'
import { ButtonLink } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { defaultPackage } from '@/lib/packages'
import { db } from '@/lib/db'
import { pricingMode } from '@/lib/pricing-mode'
import { sectionsPublic } from '@/lib/sections-mode'
import { formatPrice, type PackageShape } from '@/lib/package-shape'

/**
 * The price quoted here is the default package's, falling back to the built-in plan when
 * no package has been created — which is why adding admin-managed pricing changed nothing
 * on this page the day it shipped. Every figure below comes from that one object, so the
 * homepage, the join page and checkout cannot drift apart.
 */
export default async function LandingPage() {
  const [plan, mode, showSections] = await Promise.all([
    defaultPackage(),
    pricingMode(),
    sectionsPublic(),
  ])

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

  // One card per author, cheapest section first — the figure under a name should be the
  // lowest price at which you can read them, not whichever section sorted first.
  const authors = [...new Map(
    covered
      .flatMap((topic) => topic.sections)
      .map((section) => [section.author.id, section.author]),
  ).values()]

  const cheapest = covered
    .flatMap((topic) => topic.sections)
    .reduce<number | null>(
      (low, section) => (low === null || section.priceCents < low ? section.priceCents : low),
      null,
    )

  return (
    <>
      <Hero plan={plan} mode={mode} hasSections={authors.length > 0} />
      {covered.length > 0 ? <TopicCoverage topics={covered} /> : <CoverageSection />}
      {authors.length > 0 && <ContributorsSection authors={authors} />}
      <SampleReportSection />
      <PricingSection plan={plan} mode={mode} cheapestSectionCents={cheapest} />
    </>
  )
}

/**
 * The coverage cards, built from the topics that actually have somebody writing in them.
 *
 * Replaces the three hand-written cards below once there is real coverage to describe.
 * Those were accurate when one desk wrote everything; with named experts they became a
 * claim about a product shape that no longer matches, and a visitor comparing this to the
 * contributors band would have found two different answers on one page.
 */
function TopicCoverage({
  topics,
}: {
  topics: {
    id: string
    name: string
    blurb: string | null
    sections: { id: string; author: { name: string } }[]
  }[]
}) {
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
            reasoning shown — so you can weigh it against your own view rather than take it on
            trust.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {topics.map((topic) => (
            <div
              key={topic.id}
              className="flex flex-col rounded-lg border border-line bg-panel p-6 transition-colors hover:border-accent/40"
            >
              <h3 className="text-[18px] text-ink">{topic.name}</h3>
              {topic.blurb && (
                <p className="mt-2 flex-1 text-[14px] leading-relaxed text-ink-dim">{topic.blurb}</p>
              )}
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
                {/* Named, because the name is the reason to trust the card. */}
                {[...new Set(topic.sections.map((s) => s.author.name))].join(' · ')}
              </p>
            </div>
          ))}
        </div>

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

/**
 * The people, above the price.
 *
 * Placed here rather than at the top on purpose: the hero still sells the research, and
 * the experts are the evidence for it. Faces and one line each — the biography is a click
 * away, and a paragraph per person on a landing page is a wall nobody reads.
 */
function ContributorsSection({
  authors,
}: {
  authors: { id: string; slug: string; name: string; headline: string | null; photoUrl: string | null }[]
}) {
  return (
    <section className="border-b border-line bg-panel-2/40">
      <div className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        <div className="max-w-2xl">
          <span className="eyebrow">Written by</span>
          <h2 className="mt-3 text-balance font-display text-3xl tracking-[-0.02em] text-ink sm:text-4xl">
            Independent experts, each covering what they know.
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed text-ink-dim">
            Every report carries a name and the reasoning behind it. Subscribe to the people you
            follow rather than to everything at once.
          </p>
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {authors.map((author) => (
            <Link
              key={author.id}
              href={`/experts/${author.slug}`}
              className="group flex items-center gap-4 rounded-lg border border-line bg-panel p-5 transition-colors hover:border-accent/40"
            >
              <AuthorAvatar name={author.name} photoUrl={author.photoUrl} size={52} />
              <div className="min-w-0">
                <h3 className="text-[16px] text-ink">{author.name}</h3>
                {author.headline && (
                  <p className="mt-0.5 text-[13px] leading-snug text-ink-dim">{author.headline}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
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
  mode,
  hasSections,
}: {
  plan: PackageShape
  mode: 'public' | 'enquiry'
  hasSections: boolean
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

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <ButtonLink href="/join" size="lg">
              {mode === 'enquiry'
                ? 'Request pricing'
                : `Become a member — ${formatPrice(plan.priceCents, plan.currency)}/${shortInterval(plan)} intro`}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="#sample-report" size="lg" variant="secondary">
              Request a sample report
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * What is covered, in three cards.
 *
 * Asset classes rather than tickers, deliberately. A symbol list reads as a watchlist —
 * "these are the instruments you will be told about" — which is the promise of a signals
 * service, not a research one. The desk covers what is worth covering in a given week,
 * and naming the classes says that honestly where a fixed list of symbols would not.
 *
 * The language stays on method — structure, context, scenarios — and off levels, entries
 * and targets, for the same reason: this is analysis a reader acts on themselves.
 */
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

function SampleReportSection() {
  return (
    <section id="sample-report" className="border-b border-line bg-panel-2/40">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:items-start">
          <div>
            <span className="eyebrow">See the work first</span>
            <h2 className="mt-3 max-w-lg text-3xl leading-tight text-ink sm:text-4xl">
              Ask for a sample before you subscribe.
            </h2>
            <p className="mt-5 max-w-lg text-[16px] leading-relaxed text-ink-dim">
              Tell us what you trade and we will send you a recent edition. Read it, and decide
              for yourself whether the work is worth paying for.
            </p>

            {/* One point, not a list. The watermarking and mobile-rendering claims that
                used to sit beside it were removed; a two-item list with the survivor of a
                three-item one reads as something half-finished, so this stands alone. */}
            <div className="mt-8 flex gap-3.5">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <div>
                <h3 className="font-display text-[17px] text-ink">Members-only, in every channel</h3>
                <p className="mt-1 text-[14px] leading-relaxed text-ink-dim">
                  Every email carries a link, never the research. Opening it always requires a
                  signed-in member session.
                </p>
              </div>
            </div>
          </div>

          <SampleReportForm />
        </div>
      </div>
    </section>
  )
}

function PricingSection({
  plan,
  mode,
  cheapestSectionCents,
}: {
  plan: PackageShape
  mode: 'public' | 'enquiry'
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

          {mode === 'enquiry' ? (
            <>
              {/*
                No figure, and no placeholder standing in for one. "Pricing on request"
                said plainly is a normal way to sell research; a struck-out number or a
                "from $X" would be the pressure this product does not need.
              */}
              <h2 className="mt-4 text-balance font-display text-4xl leading-tight text-ink">
                Pricing on request
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-ink-dim">
                Membership is arranged directly with the desk. Tell us how to reach you and we
                will send the figure and a payment link — by card or in crypto, whichever suits.
                Three reports a week, the complete archive, and an email the moment each one lands.
              </p>
            </>
          ) : (
            <>
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
                One plan. Three reports a week, the complete archive of everything published, and
                an email the moment each one lands. Pay by card and it renews itself — cancel any
                time — or pay in crypto and renew whenever you choose.
              </p>
              <p className="mt-3 text-[14px] leading-relaxed text-ink-dim">
                <span className="text-ink">
                  {formatPrice(plan.priceCents, plan.currency)} is an introductory rate
                </span>{' '}
                while the desk builds out its coverage. It will rise for new members later; join
                now and yours stays as it is for as long as your membership runs.
              </p>
            </>
          )}

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

          <ButtonLink href="/join" size="lg" className="mt-9 w-full">
            {mode === 'enquiry' ? 'Request pricing' : 'Continue to payment'}
            <ArrowRight className="h-4 w-4" aria-hidden />
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
