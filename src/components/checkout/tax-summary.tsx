'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

/** The tax part of a quote, as the server sends it. See src/lib/tax-quote.ts. */
export type TaxSummary = {
  country: string
  subtotalCents: number
  discountCents: number
  taxCents: number
  totalCents: number
  reverseChargedCents: number
  taxName: string | null
  taxLabel: string | null
  taxRate: number
  pricesIncludeTax: boolean
  reverseCharge: boolean
  reverseChargeAvailable: boolean
}

/** Always two decimals here: a tax line of "$6.1" reads as a typo. */
export function money(cents: number, currency: string): string {
  const value = (cents / 100).toFixed(2)
  return currency === 'USD' ? `$${value}` : `${value} ${currency}`
}

function percent(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`
}

/** "UAE VAT (5%) included", "Germany VAT (19%) added", "VAT not charged (reverse charge)", or nothing. */
export function taxLineLabel(summary: TaxSummary): string | null {
  if (summary.reverseCharge) return `${summary.taxLabel ?? 'VAT'} not charged (reverse charge)`
  if (!summary.taxName || !summary.taxRate) return null
  return `${summary.taxName} (${percent(summary.taxRate)}) ${summary.pricesIncludeTax ? 'included' : 'added'}`
}

/**
 * Price, discount, tax and total — the order summary every checkout shows. Each figure is
 * the server's; nothing is worked out here.
 */
export function TaxBreakdown({
  summary,
  currency,
  discountLabel,
  tone = 'dark',
}: {
  summary: TaxSummary
  currency: string
  discountLabel?: string | null
  tone?: 'dark' | 'light'
}) {
  const dim = tone === 'light' ? 'text-ink-on-light-dim' : 'text-ink-dim'
  const ink = tone === 'light' ? 'text-ink-on-light' : 'text-ink'
  const line = taxLineLabel(summary)
  const rows: { label: string; value: string; strong?: boolean }[] = [
    { label: 'Price', value: money(summary.subtotalCents, currency) },
  ]
  if (summary.discountCents > 0) {
    rows.push({ label: discountLabel ? `Discount (${discountLabel})` : 'Discount', value: `−${money(summary.discountCents, currency)}` })
  }
  if (line) {
    rows.push({
      label: line,
      value: summary.reverseCharge
        ? `−${money(summary.reverseChargedCents, currency)}`
        : summary.pricesIncludeTax
          ? money(summary.taxCents, currency)
          : `+${money(summary.taxCents, currency)}`,
    })
  }
  rows.push({ label: 'Total', value: money(summary.totalCents, currency), strong: true })

  return (
    <dl className="flex flex-col gap-1.5 text-[15px]">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4">
          <dt className={row.strong ? cn(ink, 'font-medium') : dim}>{row.label}</dt>
          <dd className={cn('font-mono', row.strong ? cn(ink, 'font-medium') : ink)}>{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/**
 * "Buying for a business?" — company and VAT/GST number, folded away by default. In a
 * reverse-charge country a registered business pays without VAT; elsewhere the details
 * only appear on the invoice.
 */
export function BusinessDetails({
  company,
  taxId,
  onCompany,
  onTaxId,
  onUpdate,
  tone = 'dark',
  idPrefix,
}: {
  company: string
  taxId: string
  onCompany: (value: string) => void
  onTaxId: (value: string) => void
  /** Re-run the quote now, rather than after the next pause in typing. */
  onUpdate: () => void
  tone?: 'dark' | 'light'
  idPrefix: string
}) {
  const [open, setOpen] = React.useState(Boolean(company || taxId))
  const light = tone === 'light'
  const field = cn(
    'h-11 w-full rounded-lg border px-3 text-[16px]',
    light ? 'border-ink-on-light/20 bg-white text-ink-on-light' : 'border-line bg-panel-2 text-ink',
  )
  const label = cn('mb-1.5 block font-mono text-[11px] uppercase tracking-[0.14em]', light ? 'text-ink-on-light-dim' : 'text-ink-dim')
  return (
    <div className="text-[15px]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn('underline underline-offset-4', light ? 'text-ink-on-light' : 'text-ink')}
      >
        {open ? 'Hide business details' : 'Buying for a business? Add company and tax details'}
      </button>
      {open && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={`${idPrefix}-company`} className={label}>
              Company name
            </label>
            <input id={`${idPrefix}-company`} className={field} value={company} maxLength={120} onChange={(e) => onCompany(e.target.value)} />
          </div>
          <div>
            <label htmlFor={`${idPrefix}-taxid`} className={label}>
              VAT / GST number
            </label>
            <input
              id={`${idPrefix}-taxid`}
              className={field}
              value={taxId}
              maxLength={60}
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => onTaxId(e.target.value)}
            />
          </div>
          <p className={cn('text-[13px] leading-relaxed sm:col-span-2', light ? 'text-ink-on-light-dim' : 'text-ink-dim')}>
            Shown on your tax invoice. In countries with reverse charge (EU, UK and others), registered businesses pay
            the price without VAT.{' '}
            <button type="button" onClick={onUpdate} className={cn('underline underline-offset-4', light ? 'text-ink-on-light' : 'text-ink')}>
              Update total
            </button>
          </p>
        </div>
      )}
    </div>
  )
}
