import type { Metadata } from 'next'

import { AddTaxCountry, TaxRows, type TaxRowView } from '@/app/admin/taxes/taxes-client'
import { ToastProvider } from '@/components/ui/toast'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureTaxRates } from '@/lib/tax'

export const metadata: Metadata = { title: 'Taxes', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Sales tax by the buyer's billing country, run by the owner rather than a developer.
 *
 * Countries are switched on here once the business is registered there; the rates are the
 * standard ones for digital services, to be confirmed with a tax adviser. This is software,
 * not tax advice — and every order keeps the rate it was sold at, so nothing here rewrites
 * an order or an invoice already made.
 */
export default async function TaxesPage() {
  await requireAdmin()
  await ensureTaxRates()

  const yearAgo = new Date(Date.now() - 365 * 86_400_000)
  const [rates, sold] = await Promise.all([
    db.taxRate.findMany(),
    db.checkoutOrder.groupBy({
      by: ['billingCountry'],
      where: { status: 'paid', isTest: false, paidAt: { gte: yearAgo }, billingCountry: { not: null } },
      _count: { _all: true },
    }),
  ])
  const active = new Set(rates.filter((rate) => rate.isActive).map((rate) => rate.countryCode))
  const untaxed = sold
    .filter((row) => row.billingCountry && !active.has(row.billingCountry))
    .map((row) => ({ code: row.billingCountry as string, orders: row._count._all }))
    .sort((a, b) => b.orders - a.orders)

  const rows: TaxRowView[] = rates
    .map((rate) => ({
      code: rate.countryCode,
      name: rate.name,
      label: rate.label,
      ratePercent: Number((Number(rate.rate) * 100).toFixed(2)),
      pricesIncludeTax: rate.pricesIncludeTax,
      reverseCharge: rate.reverseCharge,
      isActive: rate.isActive,
    }))
    .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.code.localeCompare(b.code))

  return (
    <ToastProvider>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-5 sm:py-12">
        <span className="eyebrow">Money in</span>
        <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Taxes</h1>
        <p className="mt-3 max-w-3xl text-[18px] leading-relaxed text-ink-dim">
          Tax is charged by the buyer&rsquo;s billing country, only for countries switched <strong className="text-ink">on</strong>{' '}
          here. Turn a country on once the business is registered there. Rates are the standard rates for digital services;
          confirm them with your tax adviser. Each order keeps the rate it was sold at.
        </p>

        <section className="mt-10">
          <h2 className="text-[22px] text-ink">Where you sell without charging tax (last 12 months)</h2>
          {untaxed.length === 0 ? (
            <p className="mt-2 text-[16px] text-ink-dim">Every country with paid orders is being charged tax.</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {untaxed.map((row) => (
                <li key={row.code} className="rounded-full border border-line bg-panel px-3 py-1.5 font-mono text-[15px] text-ink">
                  {row.code} · {row.orders} order{row.orders === 1 ? '' : 's'}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[15px] text-ink-dim">Useful for spotting countries where you may need to register.</p>
        </section>

        <section className="mt-10">
          <h2 className="text-[22px] text-ink">Countries</h2>
          <TaxRows rows={rows} />
        </section>

        <section className="mt-10">
          <h2 className="text-[22px] text-ink">Add a country</h2>
          <AddTaxCountry />
        </section>
      </div>
    </ToastProvider>
  )
}
