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
            Research for people who read the charts themselves.
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
