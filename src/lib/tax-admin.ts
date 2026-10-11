/** Checking what an admin typed for a tax row. Pure, so the limits are tested. */

export type TaxRowInput = {
  name: string
  label: string
  /** As typed: a percent, 5 for 5%. */
  ratePercent: number
  pricesIncludeTax: boolean
  reverseCharge: boolean
  isActive: boolean
}

export function validateTaxRow(raw: Partial<Record<keyof TaxRowInput, unknown>>):
  | { ok: true; value: { name: string; label: string; rate: number; pricesIncludeTax: boolean; reverseCharge: boolean; isActive: boolean } }
  | { ok: false; error: string } {
  const name = String(raw.name ?? '').trim()
  if (!name) return { ok: false, error: 'Give it the name that goes on invoices, like “UAE VAT”.' }
  if (name.length > 60) return { ok: false, error: 'The name is too long.' }
  const label = String(raw.label ?? '').trim() || 'VAT'
  if (label.length > 12) return { ok: false, error: 'The short name is too long — VAT, GST.' }
  const percent = Number(raw.ratePercent)
  if (!Number.isFinite(percent) || percent < 0 || percent > 50) return { ok: false, error: 'The rate must be between 0 and 50%.' }
  // Stored to four decimal places of a fraction: 8.1% is 0.081, 25.5% is 0.255.
  const rate = Math.round(percent * 100) / 10_000
  return {
    ok: true,
    value: {
      name,
      label,
      rate,
      pricesIncludeTax: raw.pricesIncludeTax !== false,
      reverseCharge: raw.reverseCharge === true,
      isActive: raw.isActive === true,
    },
  }
}
