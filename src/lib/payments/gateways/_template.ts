/**
 * How to add a payment provider — Telr, Network International (N-Genius), Checkout.com,
 * PayTabs, Paymob, Coinbase Commerce, Binance Pay, BitPay — in one file.
 *
 * 1. Copy this file to gateways/{provider}.ts and fill in each part below.
 * 2. Add it to BUILT_IN in registry.ts. It then appears on Payments → Providers, where an
 *    admin enters its keys and adds a rule for which buyers see it.
 * 3. Its webhook URL is /api/webhooks/payments/{id}. Nothing else needs a route.
 *
 * Rules every provider follows:
 * - Put our order id in the provider's metadata or reference, so a confirmation finds it.
 * - parseWebhook verifies a signature (constant-time compare) or re-fetches the object from
 *   the provider with our own keys. Never act on a body as sent.
 * - Event ids must be stable per change, so a retried webhook is recognised as a repeat.
 * - Amounts are minor units throughout; money.ts converts for providers that want "129.00".
 * - Call the provider with callJson from http.ts, so errors carry the provider's own text.
 *
 * This file is not registered and is never offered to a buyer.
 */
import type { PaymentGateway } from '@/lib/payments/gateway-types'
// import { callJson } from '@/lib/payments/http'
// import { toMajorString } from '@/lib/payments/money'

export const templateGateway: PaymentGateway = {
  id: 'example',
  name: 'Example provider',
  label: 'Pay with Example',
  regions: 'Where it is used, in one line',
  keysHelp: 'Where in the provider dashboard the keys are found',
  webhookEvents: ['payment.completed', 'refund.completed'],
  fields: [{ key: 'secret_key', label: 'Secret key', secret: true, required: true, env: 'EXAMPLE_SECRET_KEY' }],
  currencies: ['USD'],

  async createCheckout(input, cfg) {
    // const created = await callJson<{ id: string; url: string }>('Example', 'https://api.example.com/payments', {
    //   method: 'POST',
    //   headers: { Authorization: `Bearer ${cfg.values.secret_key}` },
    //   body: JSON.stringify({ amount: input.totalMinor, currency: input.currency, reference: input.orderId,
    //     return_url: input.successUrl, cancel_url: input.cancelUrl, webhook_url: input.webhookUrl }),
    // })
    // return { sessionId: created.id, redirectUrl: created.url }
    void input
    void cfg
    throw new Error('Not implemented')
  },

  async parseWebhook(request, cfg) {
    // Verify, then map the provider's statuses onto our events:
    // return [{ type: 'payment.succeeded', eventId: `${id}:${status}`, orderId, sessionId: id, raw }]
    void request
    void cfg
    return []
  },

  async testConnection(cfg) {
    // await callJson('Example', 'https://api.example.com/account', { headers: { Authorization: `Bearer ${cfg.values.secret_key}` } })
    void cfg
    return 'Connected to Example.'
  },
}
