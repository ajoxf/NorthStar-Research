/**
 * Discounts: what one is worth, when it is live, and what it covers.
 *
 * Pure and dependency-free, like browse-filter.ts and for the same reason. These rules
 * decide what a buyer is charged, and they run on four surfaces — the two crypto checkout
 * routes, the Stripe route, and the public pages that show a reduced price. Four copies of
 * "is this sale on" is four places for them to disagree about a price, and the one that
 * disagrees in the buyer's favour is the one nobody reports.
 *
 * ## What this never does
 *
 * It never edits a price. `Section.priceCents` and `Package.priceCents` stay the list
 * price; the charge is computed from the list price and whichever offer applies, every
 * time. Withdrawing a sale therefore restores the real price by itself, and no campaign can
 * leave a permanently altered price behind it — which matters on a site where a price is a
 * thing the owner sets by hand and expects to stay set.
 *

 * No `server-only` guard: imported by client components and by `node --test`.
 */

import { z } from 'zod'

/** The smallest and largest discount an offer may carry. See `percentOff` on the model. */
export const MIN_PERCENT_OFF = 1
export const MAX_PERCENT_OFF = 99

export type OfferDurationValue = 'first_payment' | 'forever'

/** What a surface reduces an Offer row to before asking anything about it. */
export type OfferShape = {
  id: string
  name: string
  /** Null is a public sale. A value must be typed to get the discount. */
  code: string | null
  percentOff: number
  duration: OfferDurationValue
  startsAt: Date | null
  endsAt: Date | null
  maxRedemptions: number | null
  /** Paid orders carrying this offer. Derived, not stored — see offers.ts. */
  redeemedCount: number
  appliesToEverything: boolean
  archivedAt: Date | null
  sectionIds: string[]
  packageIds: string[]
}

/** The thing being bought, as far as a discount is concerned. */
export type OfferTarget = {
  sectionId?: string | null
  packageId?: string | null
}

/**
 * Codes, normalised for comparison.
 *
 * Not `normaliseCode` from codes.ts: that one is for the minted eight-character grant codes
 * and reformats anything of that length into `NSR-XXXX-XXXX`, which would turn the campaign
 * code `LAUNCH25` into `NSR-LAUN-CH25` and then fail to find it. A campaign code is free
 * text somebody chose, so the only safe normalisation is case and surrounding space.
 */
export function normaliseOfferCode(input: string): string {
  return input.trim().toUpperCase()
}

/**
 * What a price becomes under a discount.
 *
 * Rounded to the nearest cent, in integer minor units throughout — the same arithmetic
 * Stripe uses, and the reason `priceCents` is stored as 34900 rather than 349.00. Clamped
 * on both sides as a belt-and-braces measure: a stored percentage outside the allowed range
 * is a bug, but a bug that charged a negative amount or more than the list price would be a
 * worse one.
 */
export function discountedCents(priceCents: number, percentOff: number): number {
  const pct = Math.min(100, Math.max(0, percentOff))
  const charged = Math.round((priceCents * (100 - pct)) / 100)
  return Math.min(priceCents, Math.max(0, charged))
}

/**
 * Is this offer running right now?
 *
 * Archived is off whatever the dates say — that is the operator's stop button, and a stop
 * button that argued with a date would be no use. The window is inclusive at the start and
 * exclusive at the end, so an offer ending "1 March" is not live on 1 March.
 */
export function offerLive(offer: OfferShape, now: Date = new Date()): boolean {
  if (offer.archivedAt !== null) return false
  if (offer.startsAt !== null && offer.startsAt.getTime() > now.getTime()) return false
  if (offer.endsAt !== null && offer.endsAt.getTime() <= now.getTime()) return false
  if (offer.maxRedemptions !== null && offer.redeemedCount >= offer.maxRedemptions) return false
  return true
}

/**
 * Does this offer cover the thing being bought?
 *
 * **An offer with nothing selected covers nothing.** `appliesToEverything` is an explicit
 * flag rather than an inference from an empty list, because the inference is precisely the
 * empty-package bug: a package with no items was read as granting all-access, so an
 * operator who saved before ticking the contents gave away the whole site. The same
 * inference here would discount it. Read this way round, forgetting to choose costs a sale
 * that did not happen rather than revenue on every sale that did.
 */
export function offerCovers(offer: OfferShape, target: OfferTarget): boolean {
  if (offer.appliesToEverything) return true
  if (target.sectionId && offer.sectionIds.includes(target.sectionId)) return true
  if (target.packageId && offer.packageIds.includes(target.packageId)) return true
  return false
}

/**
 * Of several applicable offers, which one wins.
 *
 * Deepest discount first, because a buyer shown two prices will take the lower one and
 * being the one who charged them more is not a position to defend. Ties break towards the
 * more specific offer — a sale on this section rather than a sale on everything — which
 * cannot change the price but does decide which campaign is credited with the sale, and
 * "the one aimed at this thing" is the better answer. The last tiebreak is the id, so the
 * result is deterministic rather than dependent on row order.
 */
function better(a: OfferShape, b: OfferShape): OfferShape {
  if (a.percentOff !== b.percentOff) return a.percentOff > b.percentOff ? a : b
  if (a.appliesToEverything !== b.appliesToEverything) return a.appliesToEverything ? b : a
  return a.id <= b.id ? a : b
}

/**
 * The public sale on this thing, if there is one.
 *
 * Coded offers are excluded here and can only be found by {@link offerForCode}. That split
 * is the whole difference between the two kinds: a sale shows itself, a code has to be
 * known. Leaking a coded offer into a public price would hand everybody the discount that
 * was meant for the people who were sent it.
 */
export function publicOfferFor(
  offers: OfferShape[],
  target: OfferTarget,
  now: Date = new Date(),
): OfferShape | null {
  const applicable = offers.filter(
    (offer) => offer.code === null && offerLive(offer, now) && offerCovers(offer, target),
  )
  if (applicable.length === 0) return null
  return applicable.reduce(better)
}

/**
 * The offer a typed code names, when it is live and covers what is being bought.
 *
 * Returns null for all three failures — unknown, expired, wrong thing — on purpose at this
 * layer. The caller decides what to tell somebody, and the useful message ("that code is
 * not for this section") is worth saying; what is not worth doing is leaking which codes
 * exist to anyone willing to type a few.
 */
export function offerForCode(
  offers: OfferShape[],
  code: string,
  target: OfferTarget,
  now: Date = new Date(),
): OfferShape | null {
  const wanted = normaliseOfferCode(code)
  if (wanted === '') return null
  const applicable = offers.filter(
    (offer) =>
      offer.code !== null &&
      normaliseOfferCode(offer.code) === wanted &&
      offerLive(offer, now) &&
      offerCovers(offer, target),
  )
  if (applicable.length === 0) return null
  return applicable.reduce(better)
}

export type PricedOffer = {
  /** The list price, always — what the thing costs when no sale is running. */
  listCents: number
  /** What this buyer is actually charged now. */
  chargeCents: number
  /** Null when nothing applied, in which case the two figures above are equal. */
  offerId: string | null
  percentOff: number
  duration: OfferDurationValue | null
}

/**
 * The pair of numbers every surface needs: what it costs, and what you pay.
 *
 * Both, never just the second. A sale price shown on its own is indistinguishable from a
 * price cut, and the saving is the part that persuades anybody — so the caller is handed
 * what it needs to strike one through and print the other.
 */
export function priceWithOffer(listCents: number, offer: OfferShape | null): PricedOffer {
  if (offer === null) {
    return { listCents, chargeCents: listCents, offerId: null, percentOff: 0, duration: null }
  }
  return {
    listCents,
    chargeCents: discountedCents(listCents, offer.percentOff),
    offerId: offer.id,
    percentOff: offer.percentOff,
    duration: offer.duration,
  }
}

/* ------------------------------------------------------------------------- *
 * What the admin form may send.
 * ------------------------------------------------------------------------- */

/**
 * Validation for creating and editing an offer.
 *
 * Here rather than in the route so the rules are testable and so the create and edit
 * endpoints cannot drift apart about what a legal offer is — the same arrangement
 * packageInputSchema and sectionInputSchema already have.
 */
export const offerInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Give the campaign a name.').max(80),
    /**
     * Empty means a public sale. Not null, because an HTML form sends '' for a box
     * somebody left alone and making the operator understand the difference would be
     * making them do the form's job.
     */
    code: z
      .string()
      .trim()
      .max(64)
      .transform((value) => (value === '' ? null : normaliseOfferCode(value)))
      .nullable()
      .default(null),
    percentOff: z
      .number()
      .int()
      .min(MIN_PERCENT_OFF, 'A discount has to be at least 1%.')
      .max(
        MAX_PERCENT_OFF,
        'The most an offer can take off is 99%. A free subscription is a comp — issue a gifted code instead.',
      ),
    duration: z.enum(['first_payment', 'forever']).default('first_payment'),
    startsAt: z.coerce.date().nullable().default(null),
    endsAt: z.coerce.date().nullable().default(null),
    maxRedemptions: z.number().int().min(1).max(100_000).nullable().default(null),
    appliesToEverything: z.boolean().default(false),
    sectionIds: z.array(z.string().min(1)).max(200).default([]),
    packageIds: z.array(z.string().min(1)).max(200).default([]),
  })
  .refine(
    (input) =>
      input.appliesToEverything || input.sectionIds.length > 0 || input.packageIds.length > 0,
    {
      message:
        'Choose what this applies to, or tick “everything on sale”. An offer with nothing selected discounts nothing.',
      path: ['sectionIds'],
    },
  )
  .refine((input) => !input.startsAt || !input.endsAt || input.endsAt > input.startsAt, {
    message: 'The end has to come after the start.',
    path: ['endsAt'],
  })

export type OfferInput = z.infer<typeof offerInputSchema>
