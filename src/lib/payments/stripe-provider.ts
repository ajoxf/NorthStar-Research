import 'server-only'

import { db } from '@/lib/db'
import { MissingConfigError } from '@/lib/env'
import type { OfferShape } from '@/lib/offer'
import {
  createStripeCheckout,
  createStripeCoupon,
  createStripePrice,
  stripeConfigured,
  stripeProductForPrice,
  verifyStripeWebhook,
  type Stripe,
} from '@/lib/payments/stripe'
import type { CheckoutItem, PaymentProvider, StartCheckoutLine } from '@/lib/payments/types'

/**
 * Card payments, through Stripe Checkout. Recurring: Stripe stores the card and charges it
 * each period, and `invoice.paid` extends access.
 */
export const stripeProvider: PaymentProvider<Stripe.Event> = {
  id: 'stripe',
  label: 'Card',
  capabilities: { recurring: true, crypto: false, refunds: false, payouts: false },

  async configured() {
    return stripeConfigured()
  },

  canSell(item) {
    /*
     * A package needs a Stripe Price of its own, set when an operator saves it as
     * card-sellable. Charging the fallback plan's price for a differently-priced package
     * would be the silent mismatch that rule exists to prevent. Sections are exempt: their
     * Price is created on first sale (below), because a section's price is set here.
     */
    if (item.kind === 'package' && item.id !== null && !item.stripePriceId) {
      return 'This membership cannot be paid by card yet. Choose crypto, or contact support — nothing has been charged.'
    }
    return null
  },

  async startCheckout({ orderId, email, lines, offer }) {
    const priceIds = await Promise.all(
      lines.map((line) => (line.item.kind === 'section' ? sectionPriceId(line.item) : line.item.stripePriceId)),
    )
    const couponId = offer ? await couponForLines(offer, lines, priceIds) : null
    const single = lines.length === 1 ? lines[0].item : null

    const { url, sessionId } = await createStripeCheckout(email, {
      priceIds,
      planName: single?.name ?? `${lines.length} items`,
      ...(single?.kind === 'section' ? { sectionId: single.id } : {}),
      ...(single?.kind === 'package' && single.id ? { packageId: single.id } : {}),
      couponId,
      offerId: offer?.id ?? null,
      orderId,
    })
    return { checkoutUrl: url, providerRef: sessionId }
  },

  async verifyWebhook(rawBody, headers) {
    const signature = headers.get('stripe-signature')
    if (!signature) return { ok: false, status: 400, error: 'missing signature' }
    try {
      return { ok: true, event: verifyStripeWebhook(rawBody, signature) }
    } catch (error) {
      if (error instanceof MissingConfigError) {
        console.error(
          `[stripe:webhook] REJECTED — ${error.message} No payment can be processed until real ` +
            `Stripe credentials are set. This event was NOT actioned.`,
        )
        return { ok: false, status: 503, error: 'billing not configured' }
      }
      console.error('[stripe:webhook] signature verification failed', error)
      return { ok: false, status: 401, error: 'invalid signature' }
    }
  },
}

/**
 * A section's Stripe Price, created on its first card sale.
 *
 * Lazy because a section is priced in this app, not in Stripe, and most are never bought
 * by card on the day they are created. Stored once made, so every later sale reuses it.
 */
async function sectionPriceId(item: Extract<CheckoutItem, { kind: 'section' }>): Promise<string> {
  if (item.stripePriceId) return item.stripePriceId
  const created = await createStripePrice({
    priceCents: item.priceCents,
    currency: item.currency,
    interval: item.interval,
    productName: item.name,
    productId: item.stripeProductId,
  })
  await db.section.update({
    where: { id: item.id },
    data: { stripePriceId: created.priceId, stripeProductId: created.productId },
  })
  return created.priceId
}

/**
 * The coupon for this order: the offer's own when it covers every line, otherwise one
 * limited to the products of the lines it does cover.
 *
 * Stripe applies a coupon to the whole session unless told which products it is for. An
 * offer that covers two lines of three would otherwise discount the third as well, and the
 * card would be charged less than the order — and every line of the ledger — records. The
 * limited coupon is minted per order rather than cached: which products it names depends
 * on what is in this particular basket.
 */
async function couponForLines(
  offer: OfferShape,
  lines: StartCheckoutLine[],
  priceIds: (string | null)[],
): Promise<string | null> {
  const covered = lines.flatMap((line, index) => (line.offerApplied ? [priceIds[index]] : []))
  if (covered.length === 0) return null
  if (covered.length === lines.length) return couponForOffer(offer)
  const products = [...new Set(await Promise.all(covered.filter((id): id is string => Boolean(id)).map(stripeProductForPrice)))]
  return createStripeCoupon({
    percentOff: offer.percentOff,
    duration: offer.duration,
    name: offer.name,
    appliesToProducts: products,
  })
}

/**
 * The Stripe Coupon for an offer, minted on first card use and reused after.
 *
 * Lazy for the same reason a section's Stripe Price is: an offer can be set up, scoped and
 * scheduled long before anybody pays by card for something it covers, and minting a coupon
 * for every campaign the desk sketches out leaves a trail of unused objects in an account
 * somebody has to read.
 */
async function couponForOffer(offer: OfferShape): Promise<string> {
  const row = await db.offer.findUnique({
    where: { id: offer.id },
    select: { stripeCouponId: true },
  })
  if (row?.stripeCouponId) return row.stripeCouponId

  const couponId = await createStripeCoupon({
    percentOff: offer.percentOff,
    duration: offer.duration,
    name: offer.name,
  })
  await db.offer.update({ where: { id: offer.id }, data: { stripeCouponId: couponId } })
  return couponId
}
