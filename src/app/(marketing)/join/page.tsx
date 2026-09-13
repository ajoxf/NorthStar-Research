import type { Metadata } from 'next'
import Link from 'next/link'

import { JoinForm } from '@/app/(marketing)/join/join-form'
import { ButtonLink } from '@/components/ui/button'
import { ToastProvider } from '@/components/ui/toast'
import { isConfigured } from '@/lib/env'
import { FALLBACK_PACKAGE, formatPrice } from '@/lib/package-shape'
import { sellablePackages } from '@/lib/packages'
import { trialOffers } from '@/lib/trial'

export const metadata: Metadata = { title: 'Join' }
export const dynamic = 'force-dynamic'

/**
 * Everything on sale, with the buyer's choice carried into checkout.
 *
 * `?package=` accepts a slug so a package can be shared as a link of its own. An unknown
 * slug falls through to the default rather than erroring — a stale link should still sell
 * something — and the form shows what is selected before anyone pays, so nobody is
 * quietly sold a different thing from the one they clicked.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: { package?: string }
}) {
  /*
   * The price is on the page, always.
   *
   * This used to have two versions, chosen by a stored setting: one showing the figure and
   * one taking a request for it. Asking somebody to fill in a form to be told a number puts
   * a person and a wait between a buyer and the thing they came to buy, and most of them do
   * not come back. The setting, the form, the private links that let a quoted buyer skip
   * the form, and the endpoint behind all of it are gone.
   */

  // Resolved server-side so the page can say plainly which payment methods are actually
  // wired up, rather than presenting a button that fails at the last step.
  const cryptoReady = isConfigured('CREGIS_PROJECT_ID', 'CREGIS_API_KEY', 'CREGIS_BASE_URL')
  const cardReady = isConfigured('STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID')

  /*
   * Which trial to advertise, when there is one.
   *
   * Trials are per item and several can be open at once; /trial itself shows a chooser in
   * that case. Here the shortest is quoted, because the button names a number of days and
   * quoting the longest would overstate what somebody who picks a different offer gets.
   */
  const offers = await trialOffers()
  const trial = offers.length > 0
    ? offers.reduce((low, offer) => (offer.days < low.days ? offer : low))
    : null

  // No packages created yet means the site is still selling the plan it always sold.
  const created = await sellablePackages()
  const packages = created.length > 0 ? created : [FALLBACK_PACKAGE]

  const requested = searchParams.package
  const selected =
    packages.find((pkg) => pkg.slug === requested || pkg.id === requested) ??
    packages.find((pkg) => pkg.isDefault) ??
    packages[0]

  const multiple = packages.length > 1

  return (
    <ToastProvider>
      <div className="mx-auto grid max-w-5xl gap-12 px-5 py-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:py-24">
        <div>
          <span className="eyebrow">Membership</span>
          <h1 className="mt-3 text-balance text-4xl leading-tight text-ink sm:text-[42px]">
            {multiple ? 'Choose your membership.' : 'One plan. Three reports a week.'}
          </h1>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-ink-dim">
            {/* The interval comes from the selected package. Hard-coding "month" here is how a
                yearly plan ends up described as monthly two lines above its own price. */}
            Pay by card and your membership renews itself every {selected.interval}. Prefer crypto?
            You can pay that way too — it just needs renewing by hand each period. Either way we
            email you an access code to set up your account.
          </p>

          <ol className="mt-10 space-y-5 border-t border-line pt-8">
            {[
              {
                step: '01',
                title: 'Choose card or crypto',
                body: `${formatPrice(selected.priceCents, selected.currency)} per ${selected.interval}. Card renews automatically; crypto you renew yourself.`,
              },
              { step: '02', title: 'Receive your code', body: 'We email your access code as soon as the payment confirms.' },
              { step: '03', title: 'Create your account', body: 'Redeem the code, then sign in with Google, a password, or an email link.' },
            ].map((item) => (
              <li key={item.step} className="flex gap-4">
                <span className="font-mono text-[12px] tracking-[0.14em] text-accent">{item.step}</span>
                <div>
                  <h2 className="font-display text-[17px] text-ink">{item.title}</h2>
                  <p className="mt-1 text-[14px] leading-relaxed text-ink-dim">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="panel h-fit p-7">
          {/*
            The trial goes above the payment form, not instead of it.

            Reading the research for a fortnight is a better first step than paying for it
            sight unseen, and it is the step most people would take if offered. But it is
            only shown when a trial is actually open — a button to a page that 404s is
            worse than no button — and the payment form stays underneath either way, for
            somebody who has already decided.
          */}
          {trial && (
            <div className="mb-6 border-b border-line pb-6">
              <ButtonLink href="/trial" size="lg" className="w-full">
                Start your {trial.days}-day free trial
              </ButtonLink>
              <p className="mt-3 text-center text-[13px] leading-relaxed text-ink-dim">
                No card. It stops on its own — there is nothing to cancel.
              </p>
            </div>
          )}

          <JoinForm
            cardReady={cardReady}
            cryptoReady={cryptoReady}
            packages={packages.map((pkg) => ({
              id: pkg.id,
              name: pkg.name,
              description: pkg.description,
              priceCents: pkg.priceCents,
              currency: pkg.currency,
              interval: pkg.interval,
              features: pkg.features,
              cardAvailable: pkg.stripePriceId !== null || pkg.id === FALLBACK_PACKAGE.id,
            }))}
            selectedId={selected.id}
          />

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
