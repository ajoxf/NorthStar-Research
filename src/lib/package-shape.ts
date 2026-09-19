import { z } from 'zod'

import { PLAN } from '@/lib/env'

/**
 * What a package *is*, with no database and no `server-only` in sight.
 *
 * Everything here is pure so it can be unit-tested and reused on both sides of the
 * network boundary: the admin form validates against the same schema the API does, and
 * the price a buyer sees is formatted by the same function that builds the amount sent
 * to the processor. Two implementations of "what does $199/month look like" is exactly
 * how a page ends up advertising one figure while checkout charges another.
 */

export type BillingIntervalValue = 'month' | 'year'

/** A package as it travels — to the admin form, to the join page, into checkout. */
export type PackageShape = {
  id: string
  name: string
  slug: string
  description: string | null
  priceCents: number
  currency: string
  interval: BillingIntervalValue
  stripePriceId: string | null
  stripeProductId: string | null
  features: string[]
  sortOrder: number
  isDefault: boolean
  archivedAt: Date | null
  /**
   * The contributor this package belongs to, or null for the house membership.
   *
   * Carried on the shape rather than joined for at each call site, because the two
   * questions a package is asked — what does it cost, and whose is it — are asked in the
   * same breath on the homepage, the contributor's page and the join page.
   */
  authorId: string | null
  /** Is a free trial of this package open, and for how long? Null days means the house default. */
  trialEnabled: boolean
  trialDays: number | null
}

/**
 * The package used when none has been created yet.
 *
 * Its id is a sentinel rather than a cuid, because it corresponds to no row. Keeping the
 * $199 plan working untouched until an operator deliberately creates something else is
 * the point: adding this feature must not change what the site sells on the day it ships.
 */
export const FALLBACK_PACKAGE_ID = 'plan-default'

export const FALLBACK_PACKAGE: PackageShape = {
  id: FALLBACK_PACKAGE_ID,
  name: PLAN.name,
  slug: 'membership',
  description: PLAN.description,
  priceCents: PLAN.priceUsd * 100,
  currency: PLAN.currency,
  interval: PLAN.interval,
  stripePriceId: null,
  stripeProductId: null,
  features: ['Every new report as it publishes', 'Complete archive access', 'Emailed the moment each report lands'],
  sortOrder: 0,
  isDefault: true,
  archivedAt: null,
  // The built-in plan is the house membership by definition — it predates contributors.
  authorId: null,
  /*
   * No trial on the built-in plan. It corresponds to no row, so there is nowhere to store
   * the operator's answer — and a trial nobody can switch off is worse than none.
   * The research membership has its own trial switch, on the payment settings screen.
   */
  trialEnabled: false,
  trialDays: null,
}

export function isFallbackPackage(pkg: { id: string }): boolean {
  return pkg.id === FALLBACK_PACKAGE_ID
}

/**
 * Money, formatted for reading.
 *
 * Whole amounts lose the `.00` — "$199" is how the price is written everywhere on this
 * site — but anything with cents keeps both digits, because "$199.5" is not a price.
 */
export function formatPrice(cents: number, currency = 'USD'): string {
  const symbol = currency === 'USD' ? '$' : ''
  const value = cents / 100
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2)
  return symbol ? `${symbol}${text}` : `${text} ${currency}`
}

/** The `order_amount` string a processor is given: always two decimal places. */
export function amountString(cents: number): string {
  return (cents / 100).toFixed(2)
}

/** "$199 / month" — the whole price line, in one place. */
export function priceLine(pkg: Pick<PackageShape, 'priceCents' | 'currency' | 'interval'>): string {
  return `${formatPrice(pkg.priceCents, pkg.currency)} / ${pkg.interval}`
}

/**
 * A typed price into cents, refusing anything that is not a plain amount.
 *
 * Deliberately strict. `parseFloat` would happily read "199abc" as 199 and "1,999" as 1,
 * and a price silently misread by a factor of a thousand is not a mistake anyone catches
 * before the first buyer does.
 */
export function parsePriceCents(input: string): number | null {
  const trimmed = input.trim().replace(/^\$/, '').replace(/,/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const cents = Math.round(Number(trimmed) * 100)
  if (!Number.isFinite(cents) || cents < 0) return null
  return cents
}

/** A URL-safe handle from a name. Empty when the name has nothing usable in it. */
export function slugifyPackage(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

/**
 * One billing period on from `from`.
 *
 * `setMonth` handles the calendar properly — 31 January plus a month is 3 March in a
 * non-leap year, which is what every billing system does and what Stripe will invoice.
 */
export function addPeriod(interval: BillingIntervalValue, from: Date = new Date()): Date {
  const next = new Date(from)
  if (interval === 'year') next.setFullYear(next.getFullYear() + 1)
  else next.setMonth(next.getMonth() + 1)
  return next
}

/** Sale order: sortOrder first, then name, so the list never reshuffles on refresh. */
export function sortPackages<T extends Pick<PackageShape, 'sortOrder' | 'name'>>(packages: T[]): T[] {
  return [...packages].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

/**
 * Does the Stripe Price actually match what this package advertises?
 *
 * Returns the reason it does not, or null when it does. This is the check that stops a
 * package from promising one price and charging another — Stripe bills what its own
 * Price object says, and our row has no say in it once the buyer is on their page.
 *
 * Each mismatch is reported separately rather than as one "does not match", because the
 * remedy differs: a wrong amount means editing the package or the Stripe price, a
 * one-off price means creating a recurring one, and an archived price means the checkout
 * will fail outright.
 */
export type StripePriceFacts = {
  active: boolean
  type: string
  unitAmount: number | null
  currency: string
  interval: string | null
}

export function stripePriceMismatch(
  pkg: Pick<PackageShape, 'priceCents' | 'currency' | 'interval'>,
  price: StripePriceFacts,
): string | null {
  if (!price.active) {
    return 'That price is archived in Stripe. Every card checkout using it would fail.'
  }
  if (price.type !== 'recurring') {
    return 'That is a one-off price. A membership needs a recurring price, or nobody is actually subscribed and no renewal is ever charged.'
  }
  if (price.interval !== pkg.interval) {
    return `Stripe bills that price every ${price.interval ?? 'unknown period'}, but this package is priced per ${pkg.interval}.`
  }
  if ((price.currency ?? '').toUpperCase() !== pkg.currency.toUpperCase()) {
    return `Stripe charges in ${(price.currency ?? '').toUpperCase()}, but this package is priced in ${pkg.currency}.`
  }
  if ((price.unitAmount ?? -1) !== pkg.priceCents) {
    return (
      `Stripe would charge ${formatPrice(price.unitAmount ?? 0, price.currency.toUpperCase())} ` +
      `but this package advertises ${formatPrice(pkg.priceCents, pkg.currency)}. The buyer is charged what Stripe says.`
    )
  }
  return null
}

/** Roughly a Stripe price id, checked before spending a round trip on it. */
export const stripePriceIdSchema = z
  .string()
  .trim()
  .regex(/^price_[A-Za-z0-9]+$/, 'A Stripe price ID looks like price_1A2b3C…  (not a product or payment link ID).')

/**
 * The band a sellable price has to fall in.
 *
 * Exported so packages and sections share one definition. They are both "a thing with a
 * price that Stripe charges", and two copies of these numbers would drift the first time
 * one was adjusted.
 */
export const MIN_PRICE_CENTS = 100
export const MAX_PRICE_CENTS = 100_000_00

export const packageInputSchema = z.object({
  name: z.string().trim().min(2, 'Give the package a name.').max(60, 'Keep the name under 60 characters.'),
  description: z.string().trim().max(160, 'Keep the description under 160 characters.').optional(),
  priceCents: z
    .number({ required_error: 'Enter a price.' })
    .int('Prices are held in whole cents.')
    .min(MIN_PRICE_CENTS, 'The lowest price this can sell for is 1.00.')
    .max(MAX_PRICE_CENTS, 'That price looks like a typo. The maximum is 100,000.'),
  currency: z.enum(['USD'], { required_error: 'Choose a currency.' }),
  interval: z.enum(['month', 'year'], { required_error: 'Choose a billing interval.' }),
  /**
   * Whether this package can be bought by card.
   *
   * Separated from the price ID because they answer different questions: this is the
   * operator's intent, the ID is a mechanism. With the app creating prices itself, an
   * empty ID no longer means "not for sale by card" — it means "you decide the ID", so
   * the intent has to be stated rather than inferred from a blank field.
   */
  sellByCard: z.boolean().default(true),
  /** Optional: an existing Stripe price to use instead of one this app creates. */
  stripePriceId: stripePriceIdSchema.optional().nullable(),
  features: z.array(z.string().trim().min(1).max(80)).max(12, 'Twelve bullet points is plenty.').default([]),
  sortOrder: z.number().int().min(0).max(999).default(0),
  /**
   * Whose package this is. Null — the default — is the house membership.
   *
   * Nullable rather than optional so that clearing the attribution is expressible: an
   * omitted field on a PATCH means "leave it alone", and an explicit null means "this is
   * the house's after all". A form that could only ever set an author would make the
   * first mis-assignment permanent.
   */
  authorId: z.string().trim().min(1).nullable().optional(),
  /**
   * What this package actually grants.
   *
   * A package with an empty list is a price that gives nothing — buyable, and useless the
   * moment somebody redeems it. Optional rather than required so a draft can be saved
   * before its contents are decided; the admin says plainly when a live package is empty.
   */
  itemIds: z.array(z.string().trim().min(1)).max(50, 'Fifty items is plenty.').optional(),
  /**
   * Offer a free trial of this package.
   *
   * Off unless asked for, like every other trial switch here — a package created tomorrow
   * must not arrive giving away a fortnight nobody decided on.
   */
  trialEnabled: z.boolean().default(false),
  /** Null means "use the house default", so changing that default moves every blank one. */
  trialDays: z
    .number()
    .int()
    .min(1, 'A trial is at least a day.')
    .max(365, 'A year is the longest trial this will set.')
    .nullable()
    .optional(),
})

export type PackageInput = z.infer<typeof packageInputSchema>

/** Feature bullets from a textarea: one per line, blanks dropped. */
export function parseFeatures(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 12)
}
