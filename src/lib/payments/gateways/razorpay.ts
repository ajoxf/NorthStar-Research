import 'server-only'

import { createHmac, timingSafeEqual } from 'node:crypto'

import type { GatewayConfig, GatewayEvent, PaymentGateway } from '@/lib/payments/gateway-types'
import { basicAuth, callJson } from '@/lib/payments/http'

/* eslint-disable @typescript-eslint/no-explicit-any -- provider JSON, read defensively */

// RAZORPAY_API_BASE exists for testing against a stand-in; production never sets it.
const api = () => process.env.RAZORPAY_API_BASE?.trim() || 'https://api.razorpay.com/v1'

const rzp = (cfg: GatewayConfig, path: string, init: RequestInit = {}) =>
  callJson<any>('Razorpay', `${api()}${path}`, {
    ...init,
    headers: { Authorization: basicAuth(cfg.values.key_id, cfg.values.key_secret), ...init.headers },
  })

/** The captured payment behind a payment link, which is what Razorpay refunds. */
async function linkPayment(cfg: GatewayConfig, linkId: string): Promise<string | null> {
  const link = await rzp(cfg, `/payment_links/${linkId}`)
  return (link.payments ?? []).find((payment: any) => payment.status === 'captured')?.payment_id ?? null
}

/**
 * Razorpay Payment Links: UPI, cards, netbanking and wallets, mostly for India. Webhooks
 * are verified by HMAC-SHA256 of the raw body with the webhook secret, compared in constant
 * time. International cards and currencies need "International payments" on the account.
 */
export const razorpayGateway: PaymentGateway = {
  id: 'razorpay',
  name: 'Razorpay',
  label: 'UPI / Cards / Netbanking (India)',
  regions: 'India: UPI, RuPay and other cards, netbanking, wallets. One period per payment.',
  keysHelp:
    'Razorpay Dashboard → Account & Settings → API Keys (Key ID and Key Secret). Then Webhooks → Add new webhook, with the URL below and a secret you choose.',
  webhookEvents: ['payment_link.paid', 'payment_link.cancelled', 'payment_link.expired', 'refund.processed'],
  fields: [
    { key: 'key_id', label: 'Key ID', secret: false, required: true, env: 'RAZORPAY_KEY_ID', placeholder: 'rzp_live_… or rzp_test_…' },
    { key: 'key_secret', label: 'Key secret', secret: true, required: true, env: 'RAZORPAY_KEY_SECRET' },
    {
      key: 'webhook_secret',
      label: 'Webhook secret',
      secret: true,
      required: true,
      env: 'RAZORPAY_WEBHOOK_SECRET',
      help: 'The secret you typed when creating the webhook in Razorpay.',
    },
  ],
  currencies: ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD'],

  async createCheckout(input, cfg) {
    const link = await rzp(cfg, '/payment_links', {
      method: 'POST',
      body: JSON.stringify({
        amount: input.totalMinor,
        currency: input.currency,
        accept_partial: false,
        reference_id: input.orderId,
        description: input.lines.map((line) => line.title).join(', ').slice(0, 2000),
        customer: { email: input.customer.email },
        notify: { sms: false, email: false },
        reminder_enable: false,
        notes: { order_id: input.orderId, order_number: String(input.orderNumber) },
        callback_url: input.successUrl,
        callback_method: 'get',
      }),
    })
    return { sessionId: link.id, redirectUrl: link.short_url }
  },

  async parseWebhook(request, cfg) {
    const body = await request.text()
    const given = request.headers.get('x-razorpay-signature') ?? ''
    const expected = createHmac('sha256', cfg.values.webhook_secret).update(body).digest('hex')
    if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      throw new Error('bad signature')
    }
    const event = JSON.parse(body)
    const link = event.payload?.payment_link?.entity
    const eventId =
      request.headers.get('x-razorpay-event-id') ??
      `${event.event}:${link?.id ?? event.payload?.refund?.entity?.id}:${event.created_at}`
    const orderId = link?.notes?.order_id ?? link?.reference_id

    if (event.event === 'payment_link.paid' && orderId) {
      return [{ type: 'payment.succeeded', eventId, orderId, sessionId: link.id, raw: event }]
    }
    if ((event.event === 'payment_link.cancelled' || event.event === 'payment_link.expired') && orderId) {
      return [{ type: 'payment.failed', eventId, orderId, raw: event }]
    }
    if (event.event === 'refund.processed') {
      const refund = event.payload?.refund?.entity
      let refundOrder = refund?.notes?.order_id as string | undefined
      if (!refundOrder && refund?.payment_id) refundOrder = (await rzp(cfg, `/payments/${refund.payment_id}`)).notes?.order_id
      if (refundOrder) {
        return [{ type: 'refund.succeeded', eventId, orderId: refundOrder, refundId: refund.id, amountMinor: refund.amount, raw: event }]
      }
    }
    return [{ type: 'ignored', eventId, raw: event }]
  },

  async verify({ orderId, sessionId }, cfg) {
    const link = await rzp(cfg, `/payment_links/${sessionId}`)
    if (link.status !== 'paid' || (link.notes?.order_id ?? link.reference_id) !== orderId) return []
    return [
      { type: 'payment.succeeded', eventId: `verify:${link.id}`, orderId, sessionId: link.id, raw: { link: link.id, status: link.status } },
    ] satisfies GatewayEvent[]
  },

  async refund({ orderId, sessionId, amountMinor }, cfg) {
    const paymentId = await linkPayment(cfg, sessionId)
    if (!paymentId) throw new Error('Razorpay has no captured payment for this order.')
    const refund = await rzp(cfg, `/payments/${paymentId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ amount: amountMinor, notes: { order_id: orderId } }),
    })
    return { refundId: refund.id }
  },

  async testConnection(cfg) {
    await rzp(cfg, '/payments?count=1')
    return `Connected to Razorpay in ${cfg.values.key_id.startsWith('rzp_test_') ? 'test mode' : 'LIVE mode'}.`
  },
}
