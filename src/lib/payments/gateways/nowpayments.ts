import 'server-only'

import type { GatewayConfig, GatewayEvent, PaymentGateway } from '@/lib/payments/gateway-types'
import { callJson } from '@/lib/payments/http'
import { toMajorString } from '@/lib/payments/money'

/* eslint-disable @typescript-eslint/no-explicit-any -- provider JSON, read defensively */

// NOWPAYMENTS_API_BASE exists for testing against a stand-in; production never sets it.
const base = (cfg: GatewayConfig) =>
  process.env.NOWPAYMENTS_API_BASE?.trim() ||
  (cfg.values.environment === 'sandbox' ? 'https://api-sandbox.nowpayments.io/v1' : 'https://api.nowpayments.io/v1')

const np = (cfg: GatewayConfig, path: string, init: RequestInit = {}) =>
  callJson<any>('NOWPayments', `${base(cfg)}${path}`, {
    ...init,
    headers: { 'x-api-key': cfg.values.api_key, ...init.headers },
  })

const FAILED = new Set(['failed', 'expired'])

/**
 * NOWPayments hosted crypto invoices: USDT, USDC, BTC, ETH and 300+ coins, priced in our
 * currency. A callback is only a payment id; the payment is fetched back from NOWPayments
 * and only "finished" pays an order. Partial payments are left for an admin to confirm by
 * hand. Crypto refunds are sent from the NOWPayments dashboard, then recorded here.
 */
export const nowpaymentsGateway: PaymentGateway = {
  id: 'nowpayments',
  name: 'NOWPayments (crypto)',
  label: 'Crypto (USDT, USDC, BTC, ETH and more)',
  regions: 'Crypto worldwide: 300+ coins. One period per payment.',
  keysHelp:
    'nowpayments.io → Dashboard → Store Settings → API keys → Generate, and set your payout wallet there. For testing, use a sandbox account at account-sandbox.nowpayments.io.',
  webhookEvents: [],
  webhookNote: 'Nothing to set up: we send this URL with each invoice.',
  fields: [
    { key: 'environment', label: 'Environment', secret: false, required: true, env: 'NOWPAYMENTS_ENVIRONMENT', options: ['live', 'sandbox'] },
    { key: 'api_key', label: 'API key', secret: true, required: true, env: 'NOWPAYMENTS_API_KEY' },
  ],
  currencies: null,

  async createCheckout(input, cfg) {
    const invoice = await np(cfg, '/invoice', {
      method: 'POST',
      body: JSON.stringify({
        price_amount: Number(toMajorString(input.totalMinor, input.currency)),
        price_currency: input.currency.toLowerCase(),
        order_id: input.orderId,
        order_description: `NordStar Pro order NS-${input.orderNumber}: ${input.lines.map((line) => line.title).join(', ')}`.slice(0, 250),
        ipn_callback_url: input.webhookUrl,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        is_fee_paid_by_user: false,
      }),
    })
    if (!invoice?.invoice_url) throw new Error('NOWPayments did not return a payment page.')
    return { sessionId: `np_invoice_${invoice.id}`, redirectUrl: invoice.invoice_url }
  },

  async parseWebhook(request, cfg) {
    const body = await request.json().catch(() => ({}))
    const paymentId = String(body?.payment_id ?? '')
    if (!/^\d{1,20}$/.test(paymentId)) throw new Error('no payment_id')
    // Never the callback's own word: ask NOWPayments.
    const payment = await np(cfg, `/payment/${paymentId}`)
    const orderId = payment?.order_id as string | undefined
    const eventId = `${paymentId}:${payment.payment_status}`
    if (!orderId) return [{ type: 'ignored', eventId, raw: payment }]
    if (payment.payment_status === 'finished') {
      return [{ type: 'payment.succeeded', eventId, orderId, sessionId: `np_payment_${paymentId}`, raw: payment }] satisfies GatewayEvent[]
    }
    if (FAILED.has(payment.payment_status)) return [{ type: 'payment.failed', eventId, orderId, raw: payment }]
    // waiting, confirming, partially_paid …
    return [{ type: 'ignored', eventId, raw: payment }]
  },

  async testConnection(cfg) {
    const answer = await np(cfg, '/merchant/coins')
    const count = Array.isArray(answer?.selectedCurrencies) ? answer.selectedCurrencies.length : null
    return `Connected to NOWPayments ${cfg.values.environment === 'sandbox' ? 'sandbox' : 'LIVE'}${count ? ` (${count} coins enabled)` : ''}.`
  },
}
