import 'server-only'

import { db } from '@/lib/db'
import { MissingConfigError } from '@/lib/env'
import type { OfferShape } from '@/lib/offer'
import {
  createStripeCheckout,
  createStripeCoupon,
  createStripePrice,
  stripeConfigured,
  verifyStripeWebhook,
  type Stripe,
} from '@/lib/payments/stripe'
import type { CheckoutItem, PaymentProvider } from '@/lib/payments/types'

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

  async startCheckout({ email, item, offer }) {
    const priceId = item.kind === 'section' ? await sectionPriceId(item) : item.stripePriceId
    const couponId = offer ? await couponForOffer(offer) : null

    const { url, sessionId } = await createStripeCheckout(email, {
      priceId,
      planName: item.name,
      ...(item.kind === 'section' ? { sectionId: item.id } : {}),
      ...(item.kind === 'package' && item.id ? { packageId: item.id } : {}),
      couponId,
      offerId: offer?.id ?? null,
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
