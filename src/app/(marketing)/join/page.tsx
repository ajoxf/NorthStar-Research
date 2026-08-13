import type { Metadata } from 'next'
import Link from 'next/link'
import { Check } from 'lucide-react'

import { JoinForm } from '@/app/(marketing)/join/join-form'
import { ToastProvider } from '@/components/ui/toast'
import { PLAN, isConfigured } from '@/lib/env'

export const metadata: Metadata = { title: 'Join' }

export default function JoinPage() {
  // Rendered server-side so the page can say plainly that payment is not wired up yet,
  // rather than presenting a button that fails at the last step.
  const paymentReady = isConfigured('CREGIS_PROJECT_ID', 'CREGIS_API_KEY', 'CREGIS_BASE_URL')

  return (
    <ToastProvider>
      <div className="mx-auto grid max-w-5xl gap-12 px-5 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:py-24">
        <div>
          <span className="eyebrow">Membership</span>
          <h1 className="mt-3 text-balance text-4xl leading-tight text-ink sm:text-[42px]">
            One plan. Three reports a week.
          </h1>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink-dim">
            Pay once in crypto and we will email you a one-time access code. Use it to create your
            account and everything unlocks immediately — this week&apos;s reports and the full
            archive.
          </p>

          <ol className="mt-10 space-y-5 border-t border-line pt-8">
            {[
              { step: '01', title: 'Pay in crypto', body: `A single payment of $${PLAN.priceUsd} through our payment processor.` },
              { step: '02', title: 'Receive your code', body: 'We email your access code as soon as the payment confirms on-chain.' },
              { step: '03', title: 'Create your account', body: 'Redeem the code, pick a password, and start reading.' },
            ].map((item) => (
              <li key={item.step} className="flex gap-4">
                <span className="font-mono text-[12px] tracking-[0.14em] text-gold">{item.step}</span>
                <div>
                  <h2 className="font-serif text-[17px] text-ink">{item.title}</h2>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-dim">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="panel h-fit p-7">
          <div className="flex items-baseline gap-2 border-b border-line pb-6">
            <span className="font-serif text-4xl text-ink">${PLAN.priceUsd}</span>
            <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim">
              one payment
            </span>
          </div>

          <ul className="space-y-2.5 py-6">
            {['3 reports every week', 'Complete archive access', 'Email + optional WhatsApp delivery'].map(
              (item) => (
                <li key={item} className="flex items-center gap-2.5 text-[14px] text-ink-dim">
                  <Check className="h-3.5 w-3.5 shrink-0 text-up" aria-hidden />
                  {item}
                </li>
              ),
            )}
          </ul>

          <JoinForm paymentReady={paymentReady} />

          <p className="mt-5 text-center text-[13px] text-ink-dim">
            Already have a code?{' '}
            <Link href="/redeem" className="text-gold underline underline-offset-4">
              Redeem it here
            </Link>
          </p>
        </div>
      </div>
    </ToastProvider>
  )
}
