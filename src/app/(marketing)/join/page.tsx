import type { Metadata } from 'next'
import Link from 'next/link'
import { Check } from 'lucide-react'

import { JoinForm } from '@/app/(marketing)/join/join-form'
import { ToastProvider } from '@/components/ui/toast'
import { PLAN, isConfigured } from '@/lib/env'

export const metadata: Metadata = { title: 'Join' }

export default function JoinPage() {
  // Resolved server-side so the page can say plainly which payment methods are actually
  // wired up, rather than presenting a button that fails at the last step.
  const cryptoReady = isConfigured('CREGIS_PROJECT_ID', 'CREGIS_API_KEY', 'CREGIS_BASE_URL')
  const cardReady = isConfigured('STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID')

  return (
    <ToastProvider>
      <div className="mx-auto grid max-w-5xl gap-12 px-5 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:py-24">
        <div>
          <span className="eyebrow">Membership</span>
          <h1 className="mt-3 text-balance text-4xl leading-tight text-ink sm:text-[42px]">
            One plan. Four reports a week.
          </h1>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink-dim">
            Pay by card and your membership renews itself each month. Prefer crypto? You can pay
            that way too — it just needs renewing by hand each period. Either way we email you an
            access code to set up your account.
          </p>

          <ol className="mt-10 space-y-5 border-t border-line pt-8">
            {[
              { step: '01', title: 'Choose card or crypto', body: `$${PLAN.priceUsd} per month. Card renews automatically; crypto you renew yourself.` },
              { step: '02', title: 'Receive your code', body: 'We email your access code as soon as the payment confirms.' },
              { step: '03', title: 'Create your account', body: 'Redeem the code, then sign in with Google, a password, or an email link.' },
            ].map((item) => (
              <li key={item.step} className="flex gap-4">
                <span className="font-mono text-[12px] tracking-[0.14em] text-accent">{item.step}</span>
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
              per month
            </span>
          </div>

          <ul className="space-y-2.5 py-6">
            {['4 reports every week', 'Complete archive access', 'Email + optional WhatsApp delivery'].map(
              (item) => (
                <li key={item} className="flex items-center gap-2.5 text-[14px] text-ink-dim">
                  <Check className="h-3.5 w-3.5 shrink-0 text-up" aria-hidden />
                  {item}
                </li>
              ),
            )}
          </ul>

          <JoinForm cardReady={cardReady} cryptoReady={cryptoReady} />

          <p className="mt-5 text-center text-[13px] text-ink-dim">
            Already have a code?{' '}
            <Link href="/redeem" className="text-accent underline underline-offset-4">
              Redeem it here
            </Link>
          </p>
        </div>
      </div>
    </ToastProvider>
  )
}
