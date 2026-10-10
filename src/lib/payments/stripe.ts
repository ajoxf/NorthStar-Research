import 'server-only'

import Stripe from 'stripe'

import { PLAN, appBaseUrl, isConfigured, requireEnv } from '@/lib/env'
import type { StripePriceFacts } from '@/lib/package-shape'

/**
 * Stripe: the auto-renewing half of billing.
 *
 * Card members subscribe here and Stripe re-charges them every month by itself. Crypto
 * members go through Cregis instead and renew by hand, because a crypto payment is a
 * push with no stored mandate behind it — nothing to auto-charge. Both paths converge on
 * `Member.subscriptionRenewsAt`, which is the single thing that gates access.
 *
 * As with Cregis, placeholder credentials fail loudly rather than silently.
 */

/**
 * What card payment actually needs: the key, and nothing else.
 *
 * **`STRIPE_PRICE_ID` used to be in this list, and that was wrong.** It is the fallback
 * price for the built-in plan — the one the site sold before packages existed, which only
 * appears when no package has been created at all. Every package and every section now
 * carries its own Stripe Price, created by this app when the price is set.
 *
 * Having it here meant a deployment with a perfectly good secret key and no fallback price
 * had card payment refused everywhere: the join page hid the card option, section checkout
 * answered "card payment is not available yet", and saving a package as card-sellable was
 * rejected with a message naming the key that *was* set. Nothing said which variable was
 * actually missing, and the one it named was the one already there.
 *
 * The fallback path keeps its own requirement, at its own call site, where it is the only
 * thing that needs it — see `createStripeCheckout`.
 */
export const STRIPE_ENV_KEYS = ['STRIPE_SECRET_KEY'] as const

/** The legacy fallback price. Needed only by the built-in plan; see the note above. */
export const STRIPE_FALLBACK_PRICE_KEY = 'STRIPE_PRICE_ID'

export function stripeConfigured(): boolean {
  return isConfigured(...STRIPE_ENV_KEYS)
}

/**
 * Can the built-in plan be sold by card?
 *
 * Separate from `stripeConfigured` because it is a separate question, and only ever asked
 * about a deployment with no packages at all.
 */
export function stripeFallbackPriceConfigured(): boolean {
  return isConfigured(STRIPE_FALLBACK_PRICE_KEY)
}

export function stripeClient(): Stripe {
  return new Stripe(requireEnv('STRIPE_SECRET_KEY', 'Card billing (Stripe)'), {
    // Pinned so a future Stripe API change cannot silently alter webhook payload shapes.
    apiVersion: '2025-02-24.acacia',
    typescript: true,
  })
}

/**
 * Read back the facts about a Stripe Price that decide whether it is safe to sell.
 *
 * Kept here, beside the client, and returned as a plain shape so the comparison itself
 * can live in pure, tested code (`stripePriceMismatch`). Stripe charges what its own
 * Price says, so this round trip is the only thing standing between a package that
 * advertises one figure and a buyer who is charged another.
 */
export async function stripePriceFacts(priceId: string): Promise<StripePriceFacts> {
  const price = await stripeClient().prices.retrieve(priceId)
  return {
    active: price.active,
    type: price.type,
    unitAmount: price.unit_amount,
    currency: price.currency,
    interval: price.recurring?.interval ?? null,
  }
}

/**
 * Create the Stripe Price for an amount, and the Product to hang it off.
 *
 * This is what lets an operator set a price by typing a number instead of leaving the
 * app, creating a price in the Stripe dashboard, and pasting an ID back — the step that
 * made the previous version only half a pricing control.
 *
 * **Stripe prices are immutable.** There is no "change the price" call; a new amount is
 * a new Price object, and the old one keeps existing. So this creates rather than edits,
 * and the caller repoints the package at what comes back. Everyone already subscribed
 * stays on the price they signed up at, which is Stripe's behaviour and the correct one:
 * editing a price here must not silently re-bill existing members.
 *
 * The Product is reused when the package already has one, so Stripe shows one product
 * with a price history rather than a new product per edit.
 */
export async function createStripePrice(input: {
  priceCents: number
  currency: string
  interval: 'month' | 'year'
  productName: string
  productId?: string | null
}): Promise<{ priceId: string; productId: string }> {
  const stripe = stripeClient()

  let productId = input.productId ?? null
  if (productId) {
    // A product deleted or belonging to another account would fail the price call with a
    // confusing error; falling back to a fresh product is better than refusing the save.
    try {
      const existing = await stripe.products.retrieve(productId)
      if (!existing.active) productId = null
    } catch {
      productId = null
    }
  }

  if (!productId) {
    const product = await stripe.products.create({ name: input.productName })
    productId = product.id
  }

  const price = await stripe.prices.create({
    product: productId,
    unit_amount: input.priceCents,
    currency: input.currency.toLowerCase(),
    recurring: { interval: input.interval },
  })

  return { priceId: price.id, productId }
}

/**
 * A Stripe Coupon for one offer.
 *
 * Coupons are immutable in the same way Prices are, so this creates rather than edits and
 * the caller repoints the offer at what comes back. Editing an offer's percentage
 * therefore mints a new coupon and leaves the old one attached to anybody already carrying
 * it — which is the correct behaviour and the same rule the rest of this file follows.
 *
 * `duration` is where "25% off your first month" and "25% off for as long as you stay" are
 * actually told apart. They produce an identical first invoice and are entirely different
 * promises, which is why OfferDuration is stored rather than assumed.
 */
export async function createStripeCoupon(input: {
  percentOff: number
  duration: 'first_payment' | 'forever'
  name: string
  /**
   * Limit the coupon to these Stripe Products. Used when one order's offer covers some of
   * its lines and not others: a session-wide coupon would discount the uncovered lines too,
   * and the card would be charged less than the order records.
   */
  appliesToProducts?: string[]
}): Promise<string> {
  const coupon = await stripeClient().coupons.create({
    percent_off: input.percentOff,
    duration: input.duration === 'forever' ? 'forever' : 'once',
    name: input.name,
    ...(input.appliesToProducts ? { applies_to: { products: input.appliesToProducts } } : {}),
  })
  return coupon.id
}

/**
 * Archive a Stripe Price so it stops appearing as sellable in the dashboard.
 *
 * Never throws. A price we have already stopped using is bookkeeping, and failing a
 * price change because the tidy-up failed would be the wrong trade.
 */
export async function archiveStripePrice(priceId: string): Promise<void> {
  try {
    await stripeClient().prices.update(priceId, { active: false })
  } catch (error) {
    console.error(`[stripe] could not archive price ${priceId}`, error)
  }
}

/**
 * A one-off live-mode charge the operator makes to themselves, to prove the plumbing.
 *
 * `mode: 'payment'`, not `subscription`, deliberately. A subscription probe would leave a
 * real recurring charge behind that somebody has to remember to cancel; this takes one
 * dollar once. It therefore proves the key works, the session opens, the payment settles
 * and the webhook arrives correctly signed — but not the renewal path, which only a real
 * `invoice.paid` exercises. That limit is stated on the screen rather than implied.
 *
 * The metadata is what the webhook keys off to make sure this grants nothing.
 */
export async function createStripeTestCheckout(
  email: string,
  amountCents: number,
): Promise<{ url: string; sessionId: string }> {
  const stripe = stripeClient()
  const base = appBaseUrl()

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: { name: 'NordStar Pro — configuration test' },
        },
        quantity: 1,
      },
    ],
    customer_email: email,
    client_reference_id: email,
    metadata: { nordstarTest: 'true' },
    payment_intent_data: { metadata: { nordstarTest: 'true' } },
    success_url: `${base}/admin/payments/settings?test=stripe_paid`,
    cancel_url: `${base}/admin/payments/settings?test=stripe_cancelled`,
  })

  if (!session.url) throw new Error('Stripe did not return a Checkout URL.')
  return { url: session.url, sessionId: session.id }
}

/**
 * Create a Checkout Session for a recurring membership.
 *
 * `mode: 'subscription'` is what makes this recurring — Stripe stores the payment method
 * and charges it every period, emitting `invoice.paid` each time, which is what extends
 * the member's access.
 *
 * The price comes from the package when it has one of its own, and falls back to
 * `STRIPE_PRICE_ID` otherwise — which is the plan the site sold before packages existed.
 * The caller is responsible for not offering a card checkout on a package that has
 * neither; charging the fallback price for a differently-priced package would be exactly
 * the silent mismatch this feature is built to prevent.
 */
export async function createStripeCheckout(
  email: string,
  options: {
    /**
     * One Stripe Price per line. A null is the built-in plan's fallback price. Every price
     * must share one billing interval — Stripe Checkout cannot mix them in a subscription,
     * and checkout.ts refuses a basket that would ask it to.
     */
    priceIds: (string | null)[]
    planName?: string
    packageId?: string
    /** Set when this is a single section rather than the all-access plan. */
    sectionId?: string
    /** A Stripe Coupon to apply, when an offer covers this sale. See createStripeCoupon. */
    couponId?: string | null
    /** Our own offer id, carried into the subscription metadata for the webhook. */
    offerId?: string | null
    /** Our CheckoutOrder id, carried into the subscription so its events can name the order. */
    orderId?: string
  },
): Promise<{ url: string; sessionId: string }> {
  const stripe = stripeClient()
  const lineItems = options.priceIds.map((priceId) => ({
    price: priceId || requireEnv('STRIPE_PRICE_ID', 'Card billing (Stripe)'),
    quantity: 1,
  }))
  const base = appBaseUrl()

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: lineItems,
    customer_email: email,
    // Echoed back on the webhook so the payment can be tied to our CheckoutOrder row.
    client_reference_id: email,
    success_url: `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/checkout/cancelled`,
    subscription_data: {
      metadata: {
        plan: options.planName ?? PLAN.name,
        ...(options.packageId ? { packageId: options.packageId } : {}),
        ...(options.sectionId ? { sectionId: options.sectionId } : {}),
        ...(options.offerId ? { offerId: options.offerId } : {}),
        ...(options.orderId ? { orderId: options.orderId } : {}),
      },
    },
    /*
     * Our coupon, or none — never Stripe's own promotion-code box.
     *
     * `discounts` and `allow_promotion_codes` are mutually exclusive in the API, and the
     * choice between them is a real one: turning the box on would let somebody apply a
     * coupon created in the Stripe dashboard that this app has never heard of, with no
     * Offer row, no scope, no redemption count and nothing in the orders explaining why
     * the amount was lower. Offers created here stay the only way a price moves.
     */
    ...(options.couponId
      ? { discounts: [{ coupon: options.couponId }] }
      : { allow_promotion_codes: false }),
  })

  if (!session.url) {
    throw new Error('Stripe did not return a Checkout URL.')
  }

  return { url: session.url, sessionId: session.id }
}

/**
 * A Stripe-hosted page where members update their card or cancel.
 *
 * Using the portal rather than building cancellation ourselves means Stripe handles the
 * dunning, proration and compliance edge cases, and cancellations arrive back through the
 * same webhook as everything else.
 */
export async function createBillingPortalSession(customerId: string): Promise<string> {
  const stripe = stripeClient()
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appBaseUrl()}/account`,
  })
  return session.url
}

/** The Stripe Product a Price belongs to. */
export async function stripeProductForPrice(priceId: string): Promise<string> {
  const price = await stripeClient().prices.retrieve(priceId)
  return typeof price.product === 'string' ? price.product : price.product.id
}

/** Verify a webhook came from Stripe. Never trust an unverified payload. */
export function verifyStripeWebhook(payload: string, signature: string): Stripe.Event {
  const secret = requireEnv('STRIPE_WEBHOOK_SECRET', 'Stripe webhook verification')
  return stripeClient().webhooks.constructEvent(payload, signature, secret)
}

export type { Stripe }
