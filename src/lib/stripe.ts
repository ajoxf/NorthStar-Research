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

export const STRIPE_ENV_KEYS = ['STRIPE_SECRET_KEY', 'STRIPE_PRICE_ID'] as const

export function stripeConfigured(): boolean {
  return isConfigured(...STRIPE_ENV_KEYS)
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
  options: { priceId?: string | null; planName?: string; packageId?: string } = {},
): Promise<{ url: string; sessionId: string }> {
  const stripe = stripeClient()
  const priceId = options.priceId || requireEnv('STRIPE_PRICE_ID', 'Card billing (Stripe)')
  const base = appBaseUrl()

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    customer_email: email,
    // Echoed back on the webhook so the payment can be tied to our CheckoutOrder row.
    client_reference_id: email,
    success_url: `${base}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${base}/checkout/cancelled`,
    subscription_data: {
      metadata: {
        plan: options.planName ?? PLAN.name,
        ...(options.packageId ? { packageId: options.packageId } : {}),
      },
    },
    allow_promotion_codes: false,
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

/** Verify a webhook came from Stripe. Never trust an unverified payload. */
export function verifyStripeWebhook(payload: string, signature: string): Stripe.Event {
  const secret = requireEnv('STRIPE_WEBHOOK_SECRET', 'Stripe webhook verification')
  return stripeClient().webhooks.constructEvent(payload, signature, secret)
}

export type { Stripe }
