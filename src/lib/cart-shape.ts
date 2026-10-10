import { discountedCents, offerCovers, type OfferShape, type OfferTarget } from '@/lib/offer'

/**
 * The rules of a cart that need no database. Tested directly (cart-shape.test.ts); the
 * quote route and checkout both price through `priceCart`, so the figure on the cart page
 * and the figure charged come from the same arithmetic.
 */

/** More than this is a mistake or a script, not a basket. */
export const CART_MAX_ITEMS = 20

export type CartItemRef = { kind: 'section' | 'package'; id: string }

/** A line as priced: what it lists at, what is charged, and whether the order's offer touched it. */
export type PricedLine<T> = T & { listCents: number; chargeCents: number; offerId: string | null }

/**
 * One discount per order, applied to every line it covers.
 *
 * Stripe takes a single discount per checkout, and crypto is held to the same rule so the
 * two rails never quote different totals for the same basket. Of the offers that apply to
 * any line — each line's best public sale, and the typed code if it covers something —
 * the winner is the one that saves the buyer most across the lines it covers. Lines it
 * does not cover pay full price; no line ever pays more than list. A null target is a line
 * no offer can reach — the built-in plan, which has no row for an offer to be scoped to.
 */
export function priceCart<T extends { target: OfferTarget | null; listCents: number }>(
  lines: T[],
  candidates: OfferShape[],
): { lines: PricedLine<T>[]; offer: OfferShape | null; listCents: number; chargeCents: number } {
  let best: { offer: OfferShape; saving: number } | null = null
  const seen = new Set<string>()
  for (const offer of candidates) {
    if (seen.has(offer.id)) continue
    seen.add(offer.id)
    const saving = lines
      .filter((line) => line.target !== null && offerCovers(offer, line.target))
      .reduce((sum, line) => sum + (line.listCents - discountedCents(line.listCents, offer.percentOff)), 0)
    if (saving > 0 && (!best || saving > best.saving)) best = { offer, saving }
  }

  const offer = best?.offer ?? null
  const priced = lines.map((line) => {
    const covered = offer !== null && line.target !== null && offerCovers(offer, line.target)
    return {
      ...line,
      chargeCents: covered ? discountedCents(line.listCents, offer.percentOff) : line.listCents,
      offerId: covered ? offer.id : null,
    }
  })
  return {
    lines: priced,
    offer,
    listCents: priced.reduce((sum, line) => sum + line.listCents, 0),
    chargeCents: priced.reduce((sum, line) => sum + line.chargeCents, 0),
  }
}

/**
 * One billing period per order.
 *
 * Stripe's hosted checkout cannot put a monthly and a yearly price into one subscription,
 * and a crypto payment buys one period. A cart holding both is checked out as two orders,
 * one per period; this says which group each item belongs to, in a stable order.
 */
export function groupByInterval<T extends { interval: 'month' | 'year' }>(items: T[]): { interval: 'month' | 'year'; items: T[] }[] {
  return (['month', 'year'] as const)
    .map((interval) => ({ interval, items: items.filter((item) => item.interval === interval) }))
    .filter((group) => group.items.length > 0)
}

/** The same item twice is one item. Keeps the first, in the order added. */
export function dedupeItems<T extends CartItemRef>(items: T[]): T[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = `${item.kind}:${item.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
