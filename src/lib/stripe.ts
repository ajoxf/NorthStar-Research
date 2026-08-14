import 'server-only'

import Stripe from 'stripe'

import { PLAN, appBaseUrl, isConfigured, requireEnv } from '@/lib/env'

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
 * Create a Checkout Session for the $199/month subscription.
 *
 * `mode: 'subscription'` is what makes this recurring — Stripe stores the payment method
 * and charges it every period, emitting `invoice.paid` each time, which is what extends
 * the member's access.
 */
export async function createStripeCheckout(email: string): Promise<{ url: string; sessionId: string }> {
  const stripe = stripeClient()
  const priceId = requireEnv('STRIPE_PRICE_ID', 'Card billing (Stripe)')
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
      metadata: { plan: PLAN.name },
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
