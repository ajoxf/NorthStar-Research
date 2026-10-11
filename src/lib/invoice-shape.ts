/**
 * What a tax invoice says, worked out from an order as sold. Pure, so the figures on the
 * page — lines that add up to the totals, the reverse-charge line, the AED conversion — are
 * tested.
 */

import { apportion } from '@/lib/earnings'

/** The dirham is pegged to the dollar. UAE rules want the VAT in AED on foreign-currency invoices. */
export const AED_PER: Record<string, number> = { USD: 3.6725 }

export type InvoiceOrder = {
  number: number
  currency: string
  totalCents: number
  taxCents: number
  taxRate: number
  taxName: string | null
  subtotalCents: number | null
  discountCents: number | null
  reverseCharge: boolean
  billingCountry: string | null
  refundedCents: number
  lines: { name: string; chargeCents: number }[]
}

export type InvoiceFigures = {
  lines: { name: string; taxableCents: number; taxCents: number; totalCents: number }[]
  subtotalCents: number
  discountCents: number
  taxableCents: number
  taxCents: number
  totalCents: number
  /** What reverse charge left out, shown as "VAT not charged (reverse charge)". */
  reverseChargedCents: number
  refundedCents: number
  status: 'Paid' | 'Partly refunded' | 'Refunded'
  /** The VAT in AED, for a UAE buyer paying in another currency. */
  aed: { rate: number; vatAed: number } | null
}

export function invoiceFigures(order: InvoiceOrder): InvoiceFigures {
  const totalCents = order.totalCents
  const taxCents = order.taxCents
  const taxableCents = totalCents - taxCents
  const discountCents = order.discountCents ?? 0
  const subtotalCents = order.subtotalCents ?? totalCents + discountCents
  const reverseChargedCents = order.reverseCharge ? Math.max(0, subtotalCents - discountCents - totalCents) : 0

  const lines = order.lines.length ? order.lines : [{ name: 'NordStar Pro', chargeCents: totalCents }]
  const weights = lines.map((line) => Math.max(0, line.chargeCents))
  const safe = weights.some((w) => w > 0) ? weights : weights.map(() => 1)
  const totals = apportion(totalCents, safe)
  const taxes = apportion(taxCents, safe)

  const rate = AED_PER[order.currency.toUpperCase()]
  return {
    lines: lines.map((line, index) => ({
      name: line.name,
      taxableCents: totals[index] - taxes[index],
      taxCents: taxes[index],
      totalCents: totals[index],
    })),
    subtotalCents,
    discountCents,
    taxableCents,
    taxCents,
    totalCents,
    reverseChargedCents,
    refundedCents: order.refundedCents,
    status: order.refundedCents <= 0 ? 'Paid' : order.refundedCents >= totalCents ? 'Refunded' : 'Partly refunded',
    aed:
      order.billingCountry === 'AE' && order.currency.toUpperCase() !== 'AED' && rate && taxCents > 0
        ? { rate, vatAed: Math.round(taxCents * rate) }
        : null,
  }
}
