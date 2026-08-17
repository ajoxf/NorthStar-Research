import Link from 'next/link'
import { Archive, ArrowRight, Check, FileText, Lock, Smartphone } from 'lucide-react'

import { SampleReportForm } from '@/app/(marketing)/sample-report-form'
import { HeroMedia } from '@/components/hero-media'
import { ButtonLink } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PLAN } from '@/lib/env'

export default function LandingPage() {
  return (
    <>
      <Hero />
      <CoverageSection />
      <SampleReportSection />
      <PricingSection />
    </>
  )
}

function Hero() {
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
            Technical and macro analysis for traders who make their own calls.
          </h1>

          <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-ink-dim">
            NordStar Pro publishes three reports a week, covering commodities, international
            markets and indices, options, crypto and spreads, and FX. Each one carries alpha
            generation ideas, with the levels, bias and invalidation. No noise, no upsells, one
            price.
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
              Become a member — ${PLAN.priceUsd}/mo
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
 * What is actually covered, in three cards.
 *
 * The instruments are the real ones the desk publishes on — they mirror the
 * `defaultInstruments` on each report type rather than being a marketing wish-list, so a
 * prospect reading this and a member opening the reader see the same universe.
 *
 * Three cards, four report types: International Markets & Indices and FX & Currencies sit
 * together here because a prospect thinks in asset classes, not in our publishing
 * schedule. The cadence line below the cards states three a week, which is what actually
 * ships, so grouping them this way does not overstate what arrives.
 */
const COVERAGE = [
  {
    title: 'Commodities & Energy',
    analysis: 'Trend structure, key levels and the macro drivers behind them',
    instruments: ['XAUUSD', 'XAGUSD', 'WTI', 'NATGAS', 'COPPER'],
  },
  {
    title: 'Indices & FX',
    analysis: 'Index structure, cross-market rotation, rate differentials and carry',
    instruments: ['SPX', 'DAX', 'NIKKEI', 'DXY', 'EURUSD', 'GBPUSD', 'USDJPY'],
  },
  {
    title: 'Options, Crypto & Spreads',
    analysis: 'Defined-risk option structures, digital-asset levels, relative value',
    instruments: ['BTCUSD', 'ETHUSD', 'VIX', 'SPX'],
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
            Charts first, with the levels marked. Technical structure read against the macro
            backdrop, and the invalidation stated as plainly as the setup.
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

              <ul className="mt-5 flex flex-wrap gap-1.5">
                {card.instruments.map((symbol) => (
                  <li
                    key={symbol}
                    className="rounded border border-line bg-panel-2 px-2 py-1 font-mono text-[11px] tracking-[0.06em] text-ink-dim"
                  >
                    {symbol}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-6 text-[13px] leading-relaxed text-ink-dim">
          Three editions a week across this coverage. Instruments shown are representative of
          what each edition carries, not a fixed list.
        </p>
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

function PricingSection() {
  return (
    <section id="pricing">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="panel relative mx-auto max-w-xl overflow-hidden p-8 sm:p-10">
          <div
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent to-transparent"
            aria-hidden
          />

          <span className="eyebrow">Membership</span>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="font-display text-5xl text-ink">${PLAN.priceUsd}</span>
            <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-dim">
              per month
            </span>
          </div>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-dim">
            One plan. Three reports a week, the complete archive of everything published, and an
            email the moment each one lands. Pay by card and it renews itself — cancel any time —
            or pay in crypto and renew whenever you choose.
          </p>

          <ul className="mt-8 space-y-3 border-t border-line pt-7">
            {[
              'Every weekly report',
              'Full archive of every past report',
              'Mobile-ready reading view',
              'Emailed the moment each report lands',
              'Card or crypto — cancel any time',
            ].map((item) => (
              <li key={item} className="flex items-center gap-2.5 text-[15px] text-ink">
                <Check className="h-4 w-4 shrink-0 text-up" aria-hidden />
                {item}
              </li>
            ))}
          </ul>

          <ButtonLink href="/join" size="lg" className="mt-9 w-full">
            Continue to payment
            <ArrowRight className="h-4 w-4" aria-hidden />
          </ButtonLink>

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
