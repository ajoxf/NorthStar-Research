import { isPlaceholder } from '@/lib/env'

/**
 * Who is behind the site, as visitors and regulators see it.
 *
 * Read from the environment rather than written into the code because these are facts
 * only the operator knows, and a guessed legal name or address on a financial-research
 * site is worse than none. Every field is optional: an unset one is simply not shown,
 * so the footer and the terms render honestly before the details exist and complete the
 * moment they are entered in Vercel — no deploy of new code needed.
 *
 * `missing` lists what is still unset so the terms page can say, in its draft banner,
 * exactly what has to be filled in before launch.
 */
export interface CompanyDetails {
  legalName: string | null
  address: string | null
  supportEmail: string | null
  /** The law the terms are governed by, e.g. "England and Wales" or "the State of Delaware". */
  governingLaw: string | null
  missing: string[]
}

const FIELDS = {
  legalName: 'COMPANY_LEGAL_NAME',
  address: 'COMPANY_ADDRESS',
  supportEmail: 'SUPPORT_EMAIL',
  governingLaw: 'COMPANY_GOVERNING_LAW',
} as const

export function companyDetails(env: Record<string, string | undefined> = process.env): CompanyDetails {
  const read = (key: string) => {
    const value = env[key]
    return isPlaceholder(value) ? null : (value as string).trim()
  }

  const details = {
    legalName: read(FIELDS.legalName),
    address: read(FIELDS.address),
    supportEmail: read(FIELDS.supportEmail),
    governingLaw: read(FIELDS.governingLaw),
  }

  const missing = (Object.keys(FIELDS) as (keyof typeof FIELDS)[])
    .filter((field) => details[field] === null)
    .map((field) => FIELDS[field])

  return { ...details, missing }
}
