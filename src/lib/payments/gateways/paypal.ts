import 'server-only'

import type { GatewayConfig, GatewayEvent, PaymentGateway } from '@/lib/payments/gateway-types'
import { basicAuth, callJson } from '@/lib/payments/http'
import { fromMajor, toMajorString } from '@/lib/payments/money'

/* eslint-disable @typescript-eslint/no-explicit-any -- provider JSON, read defensively */

// PAYPAL_API_BASE exists for testing against a stand-in; production never sets it.
const base = (cfg: GatewayConfig) =>
  process.env.PAYPAL_API_BASE?.trim() ||
  (cfg.values.environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com')

/** OAuth tokens, one per app, reused until a minute before they expire. */
const tokens = new Map<string, { token: string; expires: number }>()

async function token(cfg: GatewayConfig): Promise<string> {
  const key = `${cfg.values.environment}:${cfg.values.client_id}`
  const cached = tokens.get(key)
  if (cached && cached.expires > Date.now() + 60_000) return cached.token
  const answer = await callJson<any>('PayPal', `${base(cfg)}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: basicAuth(cfg.values.client_id, cfg.values.client_secret), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  tokens.set(key, { token: answer.access_token, expires: Date.now() + Number(answer.expires_in ?? 3000) * 1000 })
  return answer.access_token
}

const pp = async (cfg: GatewayConfig, path: string, init: RequestInit = {}) =>
  callJson<any>('PayPal', `${base(cfg)}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${await token(cfg)}`, ...init.headers },
  })

/**
 * Capture an approved PayPal order and report what PayPal says. Safe to repeat: the
 * request id makes a second capture of the same order the first one's answer.
 */
async function captureOrder(cfg: GatewayConfig, paypalOrderId: string, prefix: string): Promise<GatewayEvent[]> {
  if (!/^[A-Z0-9-]{5,40}$/i.test(paypalOrderId)) throw new Error('not a PayPal order id')
  let order = await pp(cfg, `/v2/checkout/orders/${paypalOrderId}`)
  if (order.status === 'APPROVED') {
    order = await pp(cfg, `/v2/checkout/orders/${paypalOrderId}/capture`, {
      method: 'POST',
      headers: { 'PayPal-Request-Id': `capture-${paypalOrderId}` },
    })
  }
  const unit = order.purchase_units?.[0]
  const orderId = unit?.custom_id ?? unit?.reference_id
  const capture = unit?.payments?.captures?.[0]
  const eventId = `${prefix}${paypalOrderId}:${order.status}`
  if (!orderId) return [{ type: 'ignored', eventId, raw: order }]
  if (order.status === 'COMPLETED' && capture?.status === 'COMPLETED') {
    return [{ type: 'payment.succeeded', eventId, orderId, sessionId: paypalOrderId, raw: order }]
  }
  if (capture?.status === 'DECLINED' || order.status === 'VOIDED') return [{ type: 'payment.failed', eventId, orderId, raw: order }]
  return [{ type: 'ignored', eventId, raw: order }]
}

/**
 * PayPal Checkout (Orders v2). The buyer approves on PayPal; we then capture — from the
 * webhook, or when the buyer lands back on the success page, whichever comes first — so
 * PayPal works even before its webhook is set up. A webhook is only a pointer: the order or
 * refund is always fetched back from PayPal.
 */
export const paypalGateway: PaymentGateway = {
  id: 'paypal',
  name: 'PayPal',
  label: 'PayPal',
  regions: 'PayPal wallet and cards worldwide (USD, EUR, GBP and other PayPal currencies; not AED or INR). One period per payment.',
  keysHelp:
    'developer.paypal.com → Apps & Credentials → your app (switch Sandbox or Live) → Client ID and Secret. Add a webhook to the app with the URL and events below.',
  webhookEvents: ['CHECKOUT.ORDER.APPROVED', 'PAYMENT.CAPTURE.COMPLETED', 'PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.REFUNDED'],
  fields: [
    { key: 'environment', label: 'Environment', secret: false, required: true, env: 'PAYPAL_ENVIRONMENT', options: ['sandbox', 'live'] },
    { key: 'client_id', label: 'Client ID', secret: false, required: true, env: 'PAYPAL_CLIENT_ID' },
    { key: 'client_secret', label: 'Secret', secret: true, required: true, env: 'PAYPAL_CLIENT_SECRET' },
  ],
  currencies: ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'HKD', 'CHF', 'SEK', 'NOK', 'DKK', 'NZD', 'PLN', 'JPY'],

  async createCheckout(input, cfg) {
    const order = await pp(cfg, '/v2/checkout/orders', {
      method: 'POST',
      headers: { 'PayPal-Request-Id': `order-${input.orderId}` },
      body: JSON.stringify({
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: input.orderId,
            custom_id: input.orderId,
            description: input.lines.map((line) => line.title).join(', ').slice(0, 127),
            amount: { currency_code: input.currency, value: toMajorString(input.totalMinor, input.currency) },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              brand_name: 'NordStar Pro',
              user_action: 'PAY_NOW',
              shipping_preference: 'NO_SHIPPING',
              return_url: input.successUrl,
              cancel_url: input.cancelUrl,
            },
          },
        },
      }),
    })
    const link = (order.links ?? []).find((entry: any) => entry.rel === 'payer-action' || entry.rel === 'approve')
    if (!link) throw new Error('PayPal did not return an approval link.')
    return { sessionId: order.id, redirectUrl: link.href }
  },

  async parseWebhook(request, cfg) {
    const event = await request.json().catch(() => ({}))
    const resource = event?.resource ?? {}
    switch (event?.event_type) {
      case 'CHECKOUT.ORDER.APPROVED':
        return captureOrder(cfg, String(resource.id ?? ''), '')
      case 'PAYMENT.CAPTURE.COMPLETED':
      case 'PAYMENT.CAPTURE.DENIED': {
        const paypalOrder = resource.supplementary_data?.related_ids?.order_id
        if (paypalOrder) return captureOrder(cfg, String(paypalOrder), '')
        break
      }
      case 'PAYMENT.CAPTURE.REFUNDED': {
        if (!/^[A-Z0-9-]{5,40}$/i.test(String(resource.id ?? ''))) break
        const refund = await pp(cfg, `/v2/payments/refunds/${resource.id}`)
        let orderId = refund.custom_id as string | undefined
        if (!orderId) {
          const up = (refund.links ?? []).find((entry: any) => entry.rel === 'up')?.href as string | undefined
          const captureId = up?.split('/captures/')[1]
          if (captureId) orderId = (await pp(cfg, `/v2/payments/captures/${captureId}`)).custom_id
        }
        if (refund.status === 'COMPLETED' && orderId) {
          return [
            {
              type: 'refund.succeeded',
              eventId: String(event.id),
              orderId,
              refundId: refund.id,
              amountMinor: fromMajor(refund.amount.value, refund.amount.currency_code),
              raw: event,
            },
          ]
        }
        break
      }
    }
    return [{ type: 'ignored', eventId: String(event?.id ?? `paypal:${Date.now()}`), raw: event }]
  },

  async verify({ orderId, sessionId }, cfg) {
    const events = await captureOrder(cfg, sessionId, 'verify:')
    return events.filter((event) => event.type === 'payment.succeeded' && event.orderId === orderId)
  },

  async refund({ orderId, sessionId, amountMinor, currency }, cfg) {
    const order = await pp(cfg, `/v2/checkout/orders/${sessionId}`)
    const captureId = order.purchase_units?.[0]?.payments?.captures?.[0]?.id
    if (!captureId) throw new Error('PayPal has no captured payment for this order.')
    const refund = await pp(cfg, `/v2/payments/captures/${captureId}/refund`, {
      method: 'POST',
      headers: { 'PayPal-Request-Id': `refund-${orderId}-${amountMinor}-${Date.now()}` },
      body: JSON.stringify({ amount: { value: toMajorString(amountMinor, currency), currency_code: currency }, custom_id: orderId }),
    })
    return { refundId: refund.id }
  },

  async testConnection(cfg) {
    await token(cfg)
    return `Connected to PayPal ${cfg.values.environment === 'live' ? 'LIVE' : 'sandbox'}.`
  },
}
