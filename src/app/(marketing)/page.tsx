import Link from 'next/link'
import {
  Archive,
  ArrowRight,
  Check,
  FileText,
  Lock,
  MessageCircle,
  ShieldCheck,
  Smartphone,
} from 'lucide-react'

import { HeroVideo } from '@/components/hero-video'
import { InstrumentTable } from '@/components/instrument-table'
import { ButtonLink } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PLAN } from '@/lib/env'
import { PREVIEW_INSTRUMENTS, REPORT_TYPES } from '@/lib/report-content'

export default function LandingPage() {
  return (
    <>
      <Hero />
      <ReportsSection />
      <FormatSection />
      <PricingSection />
    </>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      {/* Supply footage by setting NEXT_PUBLIC_HERO_VIDEO_URL (and optionally
          NEXT_PUBLIC_HERO_POSTER_URL). Until then the grid backdrop stands in and the
          hero still looks deliberate. */}
      <HeroVideo
        src={process.env.NEXT_PUBLIC_HERO_VIDEO_URL}
        poster={process.env.NEXT_PUBLIC_HERO_POSTER_URL}
      />
      <div className="grid-backdrop absolute inset-0 opacity-30" aria-hidden />
      <div
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent"
        aria-hidden
      />

      <div className="relative mx-auto max-w-6xl px-5 py-24 sm:py-36">
        <div className="max-w-2xl animate-fade-up">
          <Badge tone="accent" className="mb-6">
            Four reports · Every week
          </Badge>

          {/* Oversized and tightly tracked, per the reference: the headline is the
              design, so it runs larger and closer than a default type scale would. */}
          <h1 className="text-balance font-display text-[2.75rem] font-semibold tracking-[-0.035em] text-ink sm:text-6xl md:text-7xl">
            Research written for people who actually take the trade.
          </h1>

          <p className="mt-7 max-w-xl text-[17px] leading-relaxed text-ink-dim">
            NorthStar Research publishes four reports a week — commodities, international markets
            and indices, option, crypto and spread opportunities, and FX. Levels, bias, invalidation
            and positioning notes. No noise, no upsells, one price.
          </p>

          {/* Icon + uppercase meta row, sitting between the copy and the actions. */}
          <ul className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-3">
            {[
              { icon: FileText, label: '4 reports / week' },
              { icon: Archive, label: 'Full archive' },
              { icon: Smartphone, label: 'Email + WhatsApp' },
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
            <ButtonLink href="#format" size="lg" variant="secondary">
              See the report format
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  )
}

function ReportsSection() {
  return (
    <section id="reports" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <span className="eyebrow">The weekly cadence</span>
        <h2 className="mt-3 max-w-xl text-3xl leading-tight text-ink sm:text-4xl">
          Four reports, published on a fixed schedule.
        </h2>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {REPORT_TYPES.map((report, index) => (
            <article
              key={report.value}
              className="panel group flex flex-col p-6 transition-colors hover:border-accent/40"
            >
              <div className="mb-5 flex items-center justify-between">
                <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">
                  Report {index + 1}
                </span>
                <FileText className="h-4 w-4 text-ink-dim transition-colors group-hover:text-accent" aria-hidden />
              </div>

              <h3 className="font-display text-xl leading-snug text-ink">{report.shortLabel}</h3>
              <p className="mt-3 flex-1 text-[15px] leading-relaxed text-ink-dim">{report.blurb}</p>

              <ul className="mt-6 space-y-2 border-t border-line pt-5">
                {['Weekly bias', 'Support & resistance', 'Invalidation levels'].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-[13px] text-ink-dim">
                    <Check className="h-3.5 w-3.5 shrink-0 text-up" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

function FormatSection() {
  return (
    <section id="format" className="border-b border-line bg-panel-2/40">
      <div className="mx-auto max-w-6xl px-5 py-20">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-center">
          <div>
            <span className="eyebrow">The format</span>
            <h2 className="mt-3 text-3xl leading-tight text-ink sm:text-4xl">
              Every instrument, the same structure, every week.
            </h2>
            <p className="mt-5 text-[16px] leading-relaxed text-ink-dim">
              Each report opens with a tabbed instrument view. Select an instrument and you get the
              same five lines — weekly bias, the resistance that matters, the support that matters,
              the level that invalidates the idea, and where positioning sits. Consistent enough to
              read in two minutes, detailed enough to act on.
            </p>

            <ul className="mt-8 space-y-4">
              {[
                {
                  icon: Lock,
                  title: 'Members-only, in every channel',
                  body: 'Email and WhatsApp carry a link, never the research. Opening it always requires a signed-in member session.',
                },
                {
                  icon: ShieldCheck,
                  title: 'Watermarked and traceable',
                  body: 'Every view is signed to your account and watermarked, so reports are not worth passing around.',
                },
                {
                  icon: MessageCircle,
                  title: 'Delivered where you read',
                  body: 'Email by default. Add WhatsApp if you would rather get the link on your phone.',
                },
              ].map((feature) => (
                <li key={feature.title} className="flex gap-3.5">
                  <feature.icon className="mt-0.5 h-4.5 w-4 shrink-0 text-accent" aria-hidden />
                  <div>
                    <h3 className="font-display text-[17px] text-ink">{feature.title}</h3>
                    <p className="mt-1 text-[14px] leading-relaxed text-ink-dim">{feature.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <InstrumentTable instruments={PREVIEW_INSTRUMENTS} locked />
            <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim/70">
              Preview — illustrative data, not live research
            </p>
          </div>
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
            One plan. Four reports a week, the complete archive of everything published, and
            delivery by email or WhatsApp. Pay by card and it renews itself — cancel any time — or
            pay in crypto and renew whenever you choose.
          </p>

          <ul className="mt-8 space-y-3 border-t border-line pt-7">
            {[
              'All four weekly reports',
              'Full archive of every past report',
              'Mobile-ready reading view',
              'Optional WhatsApp delivery',
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
