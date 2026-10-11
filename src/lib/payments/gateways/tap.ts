import 'server-only'

import type { GatewayConfig, GatewayEvent, PaymentGateway } from '@/lib/payments/gateway-types'
import { callJson } from '@/lib/payments/http'
import { fromMajor, toMajorString } from '@/lib/payments/money'

/* eslint-disable @typescript-eslint/no-explicit-any -- provider JSON, read defensively */

// TAP_API_BASE exists for testing against a stand-in; production never sets it.
const api = () => process.env.TAP_API_BASE?.trim() || 'https://api.tap.company/v2'

const tap = (cfg: GatewayConfig, path: string, init: RequestInit = {}) =>
  callJson<any>('Tap', `${api()}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${cfg.values.secret_key}`, ...init.headers },
  })

const FAILED = new Set(['ABANDONED', 'CANCELLED', 'FAILED', 'DECLINED', 'RESTRICTED', 'VOID', 'TIMEDOUT'])

/** A charge as fetched from Tap's API — never as posted to us — turned into our event. */
function chargeEvent(charge: any, prefix = ''): GatewayEvent[] {
  const orderId = charge?.metadata?.order_id ?? charge?.reference?.transaction
  const eventId = `${prefix}${charge.id}:${charge.status}`
  if (!orderId) return [{ type: 'ignored', eventId, raw: charge }]
  if (charge.status === 'CAPTURED') return [{ type: 'payment.succeeded', eventId, orderId, sessionId: charge.id, raw: charge }]
  if (FAILED.has(charge.status)) return [{ type: 'payment.failed', eventId, orderId, raw: charge }]
  return [{ type: 'ignored', eventId, raw: charge }]
}

/**
 * Tap Payments hosted checkout: cards, Apple Pay, KNET, mada, Benefit across the Gulf.
 * A callback is only an id: the charge or refund is fetched back from Tap with our key and
 * that answer is what counts. Amounts go to Tap in major units, three decimals for KWD,
 * BHD and OMR.
 */
export const tapGateway: PaymentGateway = {
  id: 'tap',
  name: 'Tap Payments',
  label: 'Card / KNET / mada / Benefit / Apple Pay',
  regions: 'Gulf: UAE, Saudi (mada), Kuwait (KNET), Bahrain (Benefit), Qatar, Oman, Egypt. One period per payment.',
  keysHelp:
    'Tap Dashboard → Developers → API credentials → Secret key. No webhook secret is needed: each payment carries its own callback URL.',
  webhookEvents: [],
  webhookNote: 'Nothing to set up: we send this URL with each payment.',
  fields: [{ key: 'secret_key', label: 'Secret key', secret: true, required: true, env: 'TAP_SECRET_KEY', placeholder: 'sk_live_… or sk_test_…' }],
  currencies: ['AED', 'SAR', 'KWD', 'BHD', 'QAR', 'OMR', 'EGP', 'USD', 'EUR', 'GBP'],

  async createCheckout(input, cfg) {
    const charge = await tap(cfg, '/charges', {
      method: 'POST',
      body: JSON.stringify({
        amount: Number(toMajorString(input.totalMinor, input.currency)),
        currency: input.currency,
        customer_initiated: true,
        threeDSecure: true,
        save_card: false,
        description: input.lines.map((line) => line.title).join(', ').slice(0, 250),
        metadata: { order_id: input.orderId },
        reference: { transaction: input.orderId, order: String(input.orderNumber) },
        receipt: { email: false, sms: false },
        customer: { first_name: 'Customer', email: input.customer.email },
        source: { id: 'src_all' },
        post: { url: input.webhookUrl },
        redirect: { url: input.successUrl },
      }),
    })
    const url = charge?.transaction?.url
    if (!url) throw new Error(`Tap did not return a payment page (status ${charge?.status ?? 'unknown'}).`)
    return { sessionId: charge.id, redirectUrl: url }
  },

  async parseWebhook(request, cfg) {
    const body = await request.json().catch(() => ({}))
    const id = String(body?.id ?? '')
    if (/^chg_[A-Za-z0-9]+$/.test(id)) return chargeEvent(await tap(cfg, `/charges/${id}`))
    if (/^re_[A-Za-z0-9]+$/.test(id)) {
      const refund = await tap(cfg, `/refunds/${id}`)
      const orderId = refund?.metadata?.order_id
      if (refund.status === 'REFUNDED' && orderId) {
        return [
          {
            type: 'refund.succeeded',
            eventId: `${refund.id}:${refund.status}`,
            orderId,
            refundId: refund.id,
            amountMinor: fromMajor(refund.amount, refund.currency),
            raw: refund,
          },
        ]
      }
      return [{ type: 'ignored', eventId: `${refund.id}:${refund.status}`, raw: refund }]
    }
    throw new Error('unrecognised Tap callback')
  },

  async verify({ orderId, sessionId }, cfg) {
    const charge = await tap(cfg, `/charges/${sessionId}`)
    if ((charge?.metadata?.order_id ?? charge?.reference?.transaction) !== orderId) return []
    return chargeEvent(charge, 'verify:').filter((event) => event.type === 'payment.succeeded')
  },

  async refund({ orderId, sessionId, amountMinor, currency }, cfg) {
    const refund = await tap(cfg, '/refunds', {
      method: 'POST',
      body: JSON.stringify({
        charge_id: sessionId,
        amount: Number(toMajorString(amountMinor, currency)),
        currency,
        reason: 'requested_by_customer',
        metadata: { order_id: orderId },
        reference: { merchant: orderId },
      }),
    })
    return { refundId: refund.id }
  },

  async testConnection(cfg) {
    await tap(cfg, '/charges/list', { method: 'POST', body: JSON.stringify({ limit: 1 }) })
    return `Connected to Tap in ${cfg.values.secret_key.startsWith('sk_test_') ? 'test mode' : 'LIVE mode'}.`
  },
}
