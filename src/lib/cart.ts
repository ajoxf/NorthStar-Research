import 'server-only'

import { dedupeItems, priceCart, type CartItemRef, type PricedLine } from '@/lib/cart-shape'
import { db } from '@/lib/db'
import type { OfferShape, OfferTarget } from '@/lib/offer'
import { offerByCode, offerForCheckout } from '@/lib/offers'
import { isFallbackPackage } from '@/lib/package-shape'
import { packageById, packageForCheckout } from '@/lib/packages'
import { alreadyHoldsSection } from '@/lib/payments/checkout-rules'
import type { CheckoutItem } from '@/lib/payments/types'
import { sectionName } from '@/lib/section-shape'

/** A stable key for a cart item, the same on the client and the server. */
export function itemKey(ref: CartItemRef): string {
  return `${ref.kind}:${ref.id}`
}

export type CartLine = PricedLine<{ key: string; item: CheckoutItem; target: OfferTarget | null }>

/**
 * Look up and price a basket, the one way both the cart page and checkout do it.
 *
 * Items that are not on sale come back in `unavailable` rather than failing the whole
 * basket, so the cart can say which one went and keep the rest. Pricing is one offer for
 * the basket (see priceCart), so callers price each billing-period group on its own — each
 * group is its own order.
 */
export async function resolveCart(refs: CartItemRef[]): Promise<{ items: { key: string; item: CheckoutItem }[]; unavailable: string[] }> {
  const items: { key: string; item: CheckoutItem }[] = []
  const unavailable: string[] = []
  for (const ref of dedupeItems(refs)) {
    const item = await resolveItem(ref)
    if (item) items.push({ key: itemKey(ref), item })
    else unavailable.push(itemKey(ref))
  }
  return { items, unavailable }
}

export async function priceLines(
  items: { key: string; item: CheckoutItem }[],
  offerCode?: string | null,
  /** Further candidates — an affiliate link's visitor discount. One discount still wins. */
  extraOffers: OfferShape[] = [],
): Promise<{ lines: CartLine[]; offer: OfferShape | null; listCents: number; chargeCents: number; codeApplied: boolean }> {
  const withTargets = items.map(({ key, item }) => ({
    key,
    item,
    // The built-in plan has no row, so no offer can be scoped to it.
    target: targetFor(item),
    listCents: item.priceCents,
  }))
  const candidates = (
    await Promise.all(withTargets.map((line) => (line.target ? offerForCheckout(line.target, offerCode) : null)))
  ).filter((offer): offer is OfferShape => offer !== null)
  const cart = priceCart(withTargets, [...candidates, ...extraOffers])

  // Whether the typed code is the reason for the discount, so the page can say so.
  const codeApplied =
    Boolean(offerCode) &&
    cart.offer !== null &&
    (
      await Promise.all(
        withTargets.map((line) => (line.target ? offerByCode(offerCode as string, line.target) : null)),
      )
    ).some((offer) => offer?.id === cart.offer?.id)

  return { ...cart, codeApplied }
}

/** Keys of sections in this basket the email already holds. Packages are judged at checkout. */
export async function heldKeys(items: { key: string; item: CheckoutItem }[], email: string | null | undefined): Promise<string[]> {
  if (!email) return []
  const member = await db.member.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true } })
  if (!member) return []
  const held: string[] = []
  for (const { key, item } of items) {
    if (item.kind !== 'section') continue
    const row = await db.entitlement.findUnique({
      where: { memberId_sectionId: { memberId: member.id, sectionId: item.id } },
      select: { status: true, renewsAt: true },
    })
    if (alreadyHoldsSection(row)) held.push(key)
  }
  return held
}

function targetFor(item: CheckoutItem): OfferTarget | null {
  if (item.kind === 'section') return { sectionId: item.id }
  return item.id ? { packageId: item.id } : null
}

async function resolveItem(ref: CartItemRef): Promise<CheckoutItem | null> {
  if (ref.kind === 'section') {
    const section = await db.section.findUnique({
      where: { id: ref.id },
      include: { topic: true, author: true },
    })
    if (!section || section.archivedAt !== null) return null
    return {
      kind: 'section',
      id: section.id,
      name: sectionName(section),
      priceCents: section.priceCents,
      currency: section.currency,
      interval: section.interval,
      stripePriceId: section.stripePriceId,
      stripeProductId: section.stripeProductId,
      authorId: section.authorId,
    }
  }
  // A named package must exist and be on sale; the empty id is the default package.
  const pkg = ref.id ? await packageById(ref.id) : await packageForCheckout(null)
  if (!pkg || pkg.archivedAt !== null) return null
  return {
    kind: 'package',
    id: isFallbackPackage(pkg) ? null : pkg.id,
    name: pkg.name,
    priceCents: pkg.priceCents,
    currency: pkg.currency,
    interval: pkg.interval,
    stripePriceId: pkg.stripePriceId,
    authorId: pkg.authorId,
  }
}
