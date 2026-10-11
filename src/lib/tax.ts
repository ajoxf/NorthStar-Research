import 'server-only'

import { db } from '@/lib/db'
import type { TaxRule } from '@/lib/tax-shape'

/**
 * The business's home country: charged from day one, and the billing country assumed when
 * nothing better is known. UAE by the owner's decision.
 */
export const HOME_COUNTRY = 'AE'

/**
 * The rates the Taxes page starts with.
 *
 * Standard rates for digital services as of the time of writing; confirm with a tax
 * adviser before switching a country on. Rates change. Everything ships switched off
 * except the home country.
 */
const SEED: { code: string; name: string; label: string; rate: number; reverseCharge: boolean }[] = [
  { code: 'AE', name: 'UAE VAT', label: 'VAT', rate: 0.05, reverseCharge: false },
  ...(
    [
      ['SA', 'Saudi VAT', 'VAT', 0.15],
      ['BH', 'Bahrain VAT', 'VAT', 0.1],
      ['OM', 'Oman VAT', 'VAT', 0.05],
      ['EG', 'Egypt VAT', 'VAT', 0.14],
      ['IN', 'India GST', 'GST', 0.18],
      ['SG', 'Singapore GST', 'GST', 0.09],
      ['AU', 'Australia GST', 'GST', 0.1],
      ['NZ', 'New Zealand GST', 'GST', 0.15],
      ['ZA', 'South Africa VAT', 'VAT', 0.15],
    ] as const
  ).map(([code, name, label, rate]) => ({ code, name, label, rate, reverseCharge: false })),
  ...(
    [
      ['GB', 'UK VAT', 0.2],
      ['NO', 'Norway VAT', 0.25],
      ['CH', 'Swiss VAT', 0.081],
      ['AT', 'Austria VAT', 0.2],
      ['BE', 'Belgium VAT', 0.21],
      ['BG', 'Bulgaria VAT', 0.2],
      ['HR', 'Croatia VAT', 0.25],
      ['CY', 'Cyprus VAT', 0.19],
      ['CZ', 'Czechia VAT', 0.21],
      ['DK', 'Denmark VAT', 0.25],
      ['EE', 'Estonia VAT', 0.24],
      ['FI', 'Finland VAT', 0.255],
      ['FR', 'France VAT', 0.2],
      ['DE', 'Germany VAT', 0.19],
      ['GR', 'Greece VAT', 0.24],
      ['HU', 'Hungary VAT', 0.27],
      ['IE', 'Ireland VAT', 0.23],
      ['IT', 'Italy VAT', 0.22],
      ['LV', 'Latvia VAT', 0.21],
      ['LT', 'Lithuania VAT', 0.21],
      ['LU', 'Luxembourg VAT', 0.17],
      ['MT', 'Malta VAT', 0.18],
      ['NL', 'Netherlands VAT', 0.21],
      ['PL', 'Poland VAT', 0.23],
      ['PT', 'Portugal VAT', 0.23],
      ['RO', 'Romania VAT', 0.21],
      ['SK', 'Slovakia VAT', 0.23],
      ['SI', 'Slovenia VAT', 0.22],
      ['ES', 'Spain VAT', 0.21],
      ['SE', 'Sweden VAT', 0.25],
    ] as const
  ).map(([code, name, rate]) => ({ code, name, label: 'VAT', rate, reverseCharge: true })),
]

let seeded = false

/**
 * Put the starting rates in place, once, without touching any row an admin already has.
 * Done from code rather than a migration because deploys here push the schema and nothing
 * else; skipDuplicates makes it safe to run from every server.
 */
export async function ensureTaxRates(): Promise<void> {
  if (seeded) return
  try {
    await db.taxRate.createMany({
      data: SEED.map((row) => ({
        countryCode: row.code,
        name: row.name,
        label: row.label,
        rate: row.rate,
        pricesIncludeTax: true,
        reverseCharge: row.reverseCharge,
        isActive: row.code === HOME_COUNTRY,
      })),
      skipDuplicates: true,
    })
    seeded = true
  } catch (error) {
    console.error('[tax] could not seed tax rates', error)
  }
}

/**
 * The tax a buyer in this country is charged — only if the country is switched on. No row,
 * or an inactive one, is no tax at all. Never throws: a failed lookup charges no tax and is
 * logged, rather than stopping somebody paying.
 */
export async function taxRuleFor(country: string | null): Promise<TaxRule | null> {
  if (!country) return null
  await ensureTaxRates()
  try {
    const row = await db.taxRate.findUnique({ where: { countryCode: country.toUpperCase() } })
    if (!row || !row.isActive) return null
    return {
      countryCode: row.countryCode,
      name: row.name,
      label: row.label,
      rate: Number(row.rate),
      pricesIncludeTax: row.pricesIncludeTax,
      reverseCharge: row.reverseCharge,
    }
  } catch (error) {
    console.error(`[tax] could not read the rate for ${country}; charging none`, error)
    return null
  }
}
