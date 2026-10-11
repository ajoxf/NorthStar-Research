import { createHmac, timingSafeEqual } from 'node:crypto'

import type { CustomGatewayRow, GatewayEvent, PaymentGateway } from '@/lib/payments/gateway-types'
import { toMajorString } from '@/lib/payments/money'

/** What an admin may put in a payment link, each filled in URL-encoded. */
export const PAY_URL_PLACEHOLDERS = ['{amount}', '{amount_minor}', '{currency}', '{order_number}', '{order_id}', '{email}'] as const

/** The reference a buyer quotes with a payment: NS-1042. */
export function paymentReference(orderNumber: number): string {
  return `NS-${orderNumber}`
}

export function fillPayUrl(
  template: string,
  order: { amountMinor: number; currency: string; orderNumber: number; orderId: string; email: string },
): string {
  const values: Record<string, string> = {
    amount: toMajorString(order.amountMinor, order.currency),
    amount_minor: String(order.amountMinor),
    currency: order.currency,
    order_number: String(order.orderNumber),
    order_id: order.orderId,
    email: order.email,
  }
  return template.replace(/\{(amount_minor|amount|currency|order_number|order_id|email)\}/g, (_, key: string) =>
    encodeURIComponent(values[key]),
  )
}

/** Constant-time comparison of a hex HMAC-SHA256 signature, "sha256=" prefix allowed. */
export function signatureValid(body: string, header: string | null, secret: string): boolean {
  const given = (header ?? '').trim().replace(/^sha256=/i, '').toLowerCase()
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  if (given.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected))
}

/** Our order ids are cuids. */
const ORDER_ID = /^c[a-z0-9]{20,32}$/

/**
 * Turn a signed confirmation into events, or say why it is refused. Pure, so the format a
 * provider or Zapier must send is tested exactly.
 */
export function parseCustomWebhook(
  gatewayId: string,
  body: string,
  headers: { signature: string | null; eventId: string | null },
  secret: string | undefined,
): GatewayEvent[] {
  if (!secret) throw new Error('This provider has no webhook secret, so it cannot confirm payments automatically.')
  if (!signatureValid(body, headers.signature, secret)) throw new Error('Bad signature.')

  let payload: { order_id?: unknown; order_number?: unknown; status?: unknown; reference?: unknown }
  try {
    payload = JSON.parse(body)
  } catch {
    throw new Error('The body is not JSON.')
  }
  const status = String(payload.status ?? '').toLowerCase()
  let orderRef: string
  if (payload.order_id !== undefined) {
    if (typeof payload.order_id !== 'string' || !ORDER_ID.test(payload.order_id)) throw new Error('order_id is not a valid order id.')
    orderRef = payload.order_id
  } else if (payload.order_number !== undefined) {
    const number = String(payload.order_number).replace(/^NS-/i, '')
    if (!/^\d{1,12}$/.test(number)) throw new Error('order_number must be a number.')
    orderRef = `#${number}`
  } else {
    throw new Error('order_id or order_number is required.')
  }
  const reference = typeof payload.reference === 'string' ? payload.reference.slice(0, 200) : ''
  const eventId = (headers.eventId ?? `${orderRef}:${status}:${reference}`).slice(0, 200)

  if (['paid', 'succeeded', 'completed'].includes(status)) {
    return [{ type: 'payment.succeeded', eventId, orderId: orderRef, sessionId: reference ? `${gatewayId}:${reference}` : undefined, raw: payload }]
  }
  if (['failed', 'cancelled', 'canceled'].includes(status)) {
    return [{ type: 'payment.failed', eventId, orderId: orderRef, raw: payload }]
  }
  return [{ type: 'ignored', eventId, raw: payload }]
}

/**
 * A provider an admin added without code.
 *
 * The buyer goes to our own pay page, which shows the instructions, the reference and a
 * button opening the filled-in payment link. The order is confirmed by a signed webhook —
 * from the provider, or an automation tool such as Zapier or Make — or by an admin pressing
 * "Mark as paid" once the money has arrived.
 */
export function makeCustomGateway(row: CustomGatewayRow, siteUrl: string): PaymentGateway {
  return {
    id: row.id,
    name: row.name,
    label: row.label,
    regions: 'Added on this page. Confirmed by webhook or by "Mark as paid".',
    keysHelp:
      'Optional. Set a webhook secret if the provider — or an automation tool like Zapier or Make — will confirm payments automatically. Without one, confirm each payment with "Mark as paid" on the Payments page once the money has arrived.',
    webhookEvents: [],
    fields: [
      { key: 'webhook_secret', label: 'Webhook secret (optional)', secret: true, required: false, placeholder: 'any long random text' },
    ],
    currencies: row.currencies.length ? row.currencies : null,
    isConfigured: () => true,
    custom: row,

    async createCheckout(input) {
      return { sessionId: `${row.id}:${input.orderId}`, redirectUrl: `${siteUrl}/checkout/pay/${input.orderId}` }
    },

    async parseWebhook(request, cfg) {
      const body = await request.text()
      return parseCustomWebhook(
        row.id,
        body,
        { signature: request.headers.get('x-signature'), eventId: request.headers.get('x-event-id') },
        cfg.values.webhook_secret,
      )
    },
  }
}
