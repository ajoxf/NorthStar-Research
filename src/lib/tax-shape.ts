/**
 * Sales tax (VAT/GST) by the buyer's billing country — the arithmetic, and nothing else.
 *
 * Pure, so every number the checkout, the invoice and the ledger rely on is tested. All
 * amounts are minor units (cents), and tax is rounded once, on the order, then shared out
 * across the lines to the cent so lines always add up to the order.
 *
 * This is software, not tax advice: which countries are charged, at what rate, is the
 * admin's decision on the Taxes page.
 */

import { apportion } from '@/lib/earnings'

/** A country's tax as configured, with the rate as a fraction (0.05 is 5%). */
export type TaxRule = {
  countryCode: string
  name: string
  label: string
  rate: number
  pricesIncludeTax: boolean
  reverseCharge: boolean
}

/** Tax on an amount. Inclusive: carved out of it. Exclusive: added on top. Rounded once. */
export function computeTax(amountCents: number, rate: number, pricesIncludeTax: boolean) {
  if (!rate) return { net: amountCents, tax: 0, total: amountCents }
  if (pricesIncludeTax) {
    const net = Math.round(amountCents / (1 + rate))
    return { net, tax: amountCents - net, total: amountCents }
  }
  const tax = Math.round(amountCents * rate)
  return { net: amountCents, tax, total: amountCents + tax }
}

/** A business buyer pays without tax: the rule allows it, there is a rate, and they gave a tax ID. */
export function isReverseCharge(rule: TaxRule | null, taxId: string | null | undefined): boolean {
  return Boolean(rule && rule.reverseCharge && rule.rate > 0 && cleanTaxId(taxId))
}

/** Spaces out, at most 40 characters. Not checked against a registry (VIES, HMRC) yet. */
export function cleanTaxId(value: string | null | undefined): string | null {
  const cleaned = (value ?? '').replace(/\s+/g, '').toUpperCase().slice(0, 40)
  return cleaned || null
}

export type TaxedLine = {
  /** After the order's discount, before tax. */
  baseCents: number
  /** What this line is charged: its share of the order total. */
  totalCents: number
  /** Its share of the order's tax. */
  taxCents: number
}

export type TaxedOrder = {
  subtotalCents: number
  discountCents: number
  /** Subtotal less discount: what tax is worked out on. */
  baseCents: number
  taxCents: number
  /** What the buyer pays, tax included. */
  totalCents: number
  /** What reverse charge took off, for the invoice line "VAT not charged". */
  reverseChargedCents: number
  taxRate: number
  taxName: string | null
  taxLabel: string | null
  pricesIncludeTax: boolean
  reverseCharge: boolean
  lines: TaxedLine[]
}

/**
 * Tax an order whose lines are already priced and discounted.
 *
 * 1. Subtotal is the list prices; the discount comes off first (capped at the subtotal).
 * 2. No rule — the country is not switched on — means no tax and no tax line.
 * 3. Reverse charge: no tax, and the total is the price before tax.
 * 4. Otherwise tax is carved out of, or added to, the discounted amount.
 */
export function taxOrder(
  lines: { listCents: number; chargeCents: number }[],
  rule: TaxRule | null,
  taxId?: string | null,
): TaxedOrder {
  const subtotalCents = lines.reduce((sum, line) => sum + line.listCents, 0)
  const charged = lines.reduce((sum, line) => sum + line.chargeCents, 0)
  const discountCents = Math.min(subtotalCents, Math.max(0, subtotalCents - charged))
  const baseCents = subtotalCents - discountCents
  const reverseCharge = isReverseCharge(rule, taxId)
  const rate = rule?.rate ?? 0
  const computed = computeTax(baseCents, rate, rule?.pricesIncludeTax ?? true)

  const taxCents = reverseCharge ? 0 : computed.tax
  const totalCents = reverseCharge ? computed.net : computed.total
  const weights = lines.map((line) => line.chargeCents)
  const totals = apportion(totalCents, weights.some((w) => w > 0) ? weights : weights.map(() => 1))
  const taxes = apportion(taxCents, weights.some((w) => w > 0) ? weights : weights.map(() => 1))

  return {
    subtotalCents,
    discountCents,
    baseCents,
    taxCents,
    totalCents,
    reverseChargedCents: reverseCharge ? computed.tax : 0,
    taxRate: rule && rate > 0 ? rate : 0,
    taxName: rule && rate > 0 && !reverseCharge ? rule.name : null,
    taxLabel: rule && rate > 0 ? rule.label : null,
    pricesIncludeTax: rule?.pricesIncludeTax ?? true,
    reverseCharge,
    lines: lines.map((line, index) => ({ baseCents: line.chargeCents, totalCents: totals[index], taxCents: taxes[index] })),
  }
}

/**
 * What a recurring card price must be so that the provider charges what we quoted, every
 * period: unchanged when tax is included in the price, more when it is added on top, less
 * when a business is reverse-charged on a tax-inclusive price.
 */
export function taxedUnitCents(listCents: number, rule: TaxRule | null, reverseCharge: boolean): number {
  if (!rule || !rule.rate) return listCents
  if (reverseCharge) return rule.pricesIncludeTax ? Math.round(listCents / (1 + rule.rate)) : listCents
  return rule.pricesIncludeTax ? listCents : Math.round(listCents * (1 + rule.rate))
}

/** Whether tax changes what the buyer pays compared with the list price. */
export function taxChangesAmount(rule: TaxRule | null, reverseCharge: boolean): boolean {
  if (!rule || !rule.rate) return false
  return reverseCharge ? rule.pricesIncludeTax : !rule.pricesIncludeTax
}

/** The tax in an amount already paid at a known rate — a renewal, re-charged at the sale's terms. */
export function taxInPaid(paidCents: number, rate: number, reverseCharge: boolean): number {
  if (!rate || reverseCharge) return 0
  return paidCents - Math.round(paidCents / (1 + rate))
}

/** "5%", "8.1%", "25.5%". */
export function formatRate(rate: number): string {
  return `${Number((rate * 100).toFixed(2))}%`
}
