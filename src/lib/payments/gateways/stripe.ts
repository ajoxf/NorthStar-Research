import 'server-only'

import { REQUIRED_STRIPE_EVENTS } from '@/lib/payment-settings'
import type { PaymentGateway } from '@/lib/payments/gateway-types'
import { STRIPE_FIELDS } from '@/lib/payments/gateways/stripe-fields'
import { stripeClientFor } from '@/lib/payments/stripe'

/**
 * Stripe, as the Providers page sees it. Its checkout, subscriptions, renewals and webhook
 * are the card rail in stripe.ts and stripe-provider.ts; this only describes it, so its keys
 * can be entered, tested and paused here and buyers routed to it by rule.
 */
export const stripeGateway: PaymentGateway = {
  id: 'stripe',
  name: 'Stripe',
  label: 'Pay by card',
  regions: 'Cards worldwide. Renews monthly or yearly by itself.',
  keysHelp:
    'Stripe dashboard → Developers → API keys for the secret key. Developers → Webhooks → add an endpoint with the URL below for the signing secret.',
  webhookEvents: [...REQUIRED_STRIPE_EVENTS],
  webhookPath: '/api/webhooks/stripe',
  fields: STRIPE_FIELDS,
  currencies: null,
  recurring: true,
  rail: 'stripe',

  async testConnection(cfg) {
    const key = cfg.values.secret_key
    const balance = await stripeClientFor(key).balance.retrieve()
    const mode = key.startsWith('sk_test_') || key.startsWith('rk_test_') ? 'test' : 'live'
    return `Connected to Stripe in ${mode} mode (${balance.available.length} balance currenc${balance.available.length === 1 ? 'y' : 'ies'}).`
  },
}
