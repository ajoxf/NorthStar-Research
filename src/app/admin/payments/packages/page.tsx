import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'

import { PackageManager, type AdminPackage } from '@/app/admin/payments/packages/package-manager'
import { ToastProvider } from '@/components/ui/toast'
import { requireAdmin } from '@/lib/auth'
import { allPackages, packageUsageMap } from '@/lib/packages'
import { stripeConfigured } from '@/lib/stripe'

export const metadata: Metadata = {
  title: 'Packages and pricing',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

/**
 * What the site sells, and for how much.
 *
 * Until a package is created here the site keeps selling the built-in $199 plan exactly
 * as it did before — this screen adds the ability to change that, it does not change it.
 */
export default async function PackagesPage() {
  await requireAdmin()

  const [packages, usage] = await Promise.all([allPackages(), packageUsageMap()])

  const rows: AdminPackage[] = packages.map((pkg) => ({
    id: pkg.id,
    name: pkg.name,
    slug: pkg.slug,
    description: pkg.description,
    priceCents: pkg.priceCents,
    currency: pkg.currency,
    interval: pkg.interval,
    stripePriceId: pkg.stripePriceId,
    features: pkg.features,
    sortOrder: pkg.sortOrder,
    isDefault: pkg.isDefault,
    archived: pkg.archivedAt !== null,
    members: usage[pkg.id]?.members ?? 0,
    orders: usage[pkg.id]?.orders ?? 0,
  }))

  return (
    <ToastProvider>
      <div className="mx-auto max-w-4xl px-5 py-12">
        <Link
          href="/admin/payments/settings"
          className="mb-6 inline-flex items-center gap-1.5 font-mono text-[12px] text-ink-dim transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden />
          Payment settings
        </Link>

        <div className="mb-8">
          <span className="eyebrow">Configuration</span>
          <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Packages and pricing</h1>
          <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-dim">
            Everything the site sells. The default package is what the homepage, the FAQs and a
            bare <code className="font-mono text-[13px]">/join</code> quote; the rest are reachable
            by their own link, and every package on sale appears on the join page.
          </p>
        </div>

        {/*
          Stated once, at the top, because it is the one thing that can go wrong quietly:
          every other mistake here is visible on the join page, and this one is only
          visible on a buyer's card statement.
        */}
        <div className="mb-8 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3.5">
          <p className="text-[14px] leading-relaxed text-ink">
            <strong className="font-medium">Stripe charges what Stripe says.</strong> A card
            subscription bills the amount on the Stripe price you paste in, not the amount typed
            here — so a package is checked against Stripe before it saves, and refused if the two
            disagree. Crypto has no such object: there the price below <em>is</em> what is charged.
          </p>
          <a
            href="https://dashboard.stripe.com/prices"
            target="_blank"
            rel="noreferrer noopener"
            className="mt-2 inline-flex items-center gap-1.5 font-mono text-[12px] text-accent hover:underline"
          >
            Stripe prices
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        </div>

        <PackageManager packages={rows} stripeReady={stripeConfigured()} />

        <section className="mt-12 border-t border-line pt-8">
          <h2 className="mb-3 text-[17px] text-ink">Archive, not delete</h2>
          <p className="max-w-2xl text-[14px] leading-relaxed text-ink-dim">
            A package that anyone has bought is the record of what they bought, so it is archived
            rather than removed: it stops being sold, and every member and order pointing at it
            still resolves. A package nobody has touched — a draft, a typo, a price that was never
            offered — can be deleted outright, and that button only appears when that is true.
          </p>
          <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-dim">
            Editing a price changes what new buyers pay. It does not re-price anyone already
            subscribed: existing card subscriptions keep billing the Stripe price they were
            created against until those members are moved deliberately.
          </p>
        </section>
      </div>
    </ToastProvider>
  )
}
