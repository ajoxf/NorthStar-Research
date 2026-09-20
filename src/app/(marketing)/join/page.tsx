import type { Metadata } from 'next'
import Link from 'next/link'

import { JoinForm } from '@/app/(marketing)/join/join-form'
import { Band, Eyebrow } from '@/components/band'
import { ButtonLink } from '@/components/ui/button'
import { ToastProvider } from '@/components/ui/toast'
import { db } from '@/lib/db'
import { isConfigured } from '@/lib/env'
import { FALLBACK_PACKAGE } from '@/lib/package-shape'
import { packageContents } from '@/lib/package-items'
import { sellablePackages } from '@/lib/packages'
import { trialOffers } from '@/lib/trial'

export const metadata: Metadata = { title: 'Checkout' }
export const dynamic = 'force-dynamic'

/**
 * Checkout, on the light ground.
 *
 * Two columns from `lg`: the order summary and the three steps. On a phone the steps come
 * first and the summary follows — a buyer on a small screen wants to start, not to read a
 * receipt for something they have not bought — which is why the form carries `order-first`
 * and gives it up at the breakpoint.
 *
 * `?package=` accepts a slug so a package can be shared as a link of its own. An unknown
 * slug falls through to the default rather than erroring — a stale link should still sell
 * something — and the summary restates what is selected before anyone pays, so nobody is
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

  /*
   * Whose each package is, and what it actually grants.
   *
   * Both are read here rather than in the client component: the summary must show the
   * items a redemption will write entitlements from, and those are a database fact, not
   * something a form can be trusted to restate.
   */
  const authorIds = [...new Set(packages.map((pkg) => pkg.authorId).filter((id): id is string => id !== null))]
  const [authors, contents] = await Promise.all([
    authorIds.length
      ? db.author.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, photoUrl: true },
        })
      : Promise.resolve([]),
    packageContents(packages.map((pkg) => pkg.id)),
  ])
  const authorById = new Map(authors.map((author) => [author.id, author]))

  const multiple = packages.length > 1

  return (
    <ToastProvider>
      <Band tone="light">
        <div className="mb-10 max-w-xl">
          <Eyebrow tone="light">Checkout</Eyebrow>
          <h1 className="mt-4 text-balance font-display text-[32px] font-medium leading-[1.05] tracking-[-0.04em] sm:text-[44px]">
            {multiple ? 'Subscribe to the work you follow.' : 'Two steps and you are in.'}
          </h1>
          <p className="mt-4 text-[16px] leading-relaxed text-ink-on-light-dim">
            {/* The interval comes from the selected package. Hard-coding "month" here is how a
                yearly plan ends up described as monthly two lines above its own price. */}
            Pay by card and it renews itself every {selected.interval}. Prefer crypto? You can pay
            that way too — it just needs renewing by hand each period. Either way we email an
            access code, and you set up your account with it.
          </p>

          {/*
            The trial goes above the form, not instead of it.

            Reading the research for a fortnight is a better first step than paying for it
            sight unseen, and it is the step most people would take if offered. But it is
            only shown when a trial is actually open — a button to a page that refuses
            everybody is worse than no button — and the form stays underneath either way,
            for somebody who has already decided.
          */}
          {trial && (
            <div className="mt-7 flex flex-col gap-3 rounded-2xl border border-ink-on-light/12 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[14px] leading-relaxed text-ink-on-light">
                <strong className="font-medium">Not ready to pay?</strong> Read it free for{' '}
                {trial.days} days. No card, and it stops on its own.
              </p>
              <ButtonLink href="/trial" variant="on-light" className="shrink-0">
                Start the free trial
              </ButtonLink>
            </div>
          )}
        </div>

        <JoinForm
          cardReady={cardReady}
          cryptoReady={cryptoReady}
          packages={packages.map((pkg) => {
            const author = pkg.authorId ? authorById.get(pkg.authorId) : undefined
            return {
              id: pkg.id,
              name: pkg.name,
              description: pkg.description,
              priceCents: pkg.priceCents,
              currency: pkg.currency,
              interval: pkg.interval,
              features: pkg.features,
              cardAvailable: pkg.stripePriceId !== null || pkg.id === FALLBACK_PACKAGE.id,
              authorName: author?.name ?? null,
              authorPhotoUrl: author?.photoUrl ?? null,
              imageUrl: pkg.imageUrl,
              includes: contents[pkg.id] ?? [],
            }
          })}
          selectedId={selected.id}
        />

        <p className="mt-10 text-center text-[14px] text-ink-on-light-dim">
          Already have a code?{' '}
          <Link
            href="/redeem"
            className="font-medium text-ink-on-light underline underline-offset-4"
          >
            Redeem it here
          </Link>
        </p>
      </Band>
    </ToastProvider>
  )
}
