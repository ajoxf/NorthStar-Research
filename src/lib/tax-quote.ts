import 'server-only'

import { taxRuleFor } from '@/lib/tax'
import { taxOrder, type TaxRule, type TaxedOrder } from '@/lib/tax-shape'

/** The tax part of a quote, as a page shows it. Never a rate a buyer could change. */
export type TaxSummary = {
  country: string
  subtotalCents: number
  discountCents: number
  taxCents: number
  totalCents: number
  reverseChargedCents: number
  taxName: string | null
  taxLabel: string | null
  /** As a fraction. */
  taxRate: number
  pricesIncludeTax: boolean
  reverseCharge: boolean
  /** The country allows reverse charge, so the business box is worth showing. */
  reverseChargeAvailable: boolean
}

/**
 * Tax priced lines for a billing country — the one place quotes and checkout get their tax.
 * Amounts from the browser are never used: the lines come from priceLines on the server.
 */
export async function taxLines(
  lines: { listCents: number; chargeCents: number }[],
  country: string,
  taxId?: string | null,
): Promise<{ taxed: TaxedOrder; rule: TaxRule | null; summary: TaxSummary }> {
  const rule = await taxRuleFor(country)
  const taxed = taxOrder(lines, rule, taxId)
  return {
    taxed,
    rule,
    summary: {
      country,
      subtotalCents: taxed.subtotalCents,
      discountCents: taxed.discountCents,
      taxCents: taxed.taxCents,
      totalCents: taxed.totalCents,
      reverseChargedCents: taxed.reverseChargedCents,
      taxName: rule?.name ?? null,
      taxLabel: taxed.taxLabel,
      taxRate: taxed.taxRate,
      pricesIncludeTax: taxed.pricesIncludeTax,
      reverseCharge: taxed.reverseCharge,
      reverseChargeAvailable: Boolean(rule?.reverseCharge && rule.rate > 0),
    },
  }
}
