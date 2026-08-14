import { createHash } from 'crypto'

/**
 * Pure Cregis protocol helpers — signing, verification, nonce, callback unwrapping.
 *
 * Deliberately separate from `cregis.ts`, which carries `import 'server-only'` and so
 * cannot be loaded by a test runner. Both of the bugs this module exists to prevent are
 * silent in every log until real money is involved:
 *
 *   1. A wrong signature is rejected by Cregis, not by us.
 *   2. Reading the callback off the envelope instead of `data` matches no order at all,
 *      so a paid buyer is never granted access — and nothing in our logs looks wrong.
 *
 * Everything here is deterministic (except `cregisNonce`) and covered by
 * `cregis-protocol.test.ts`.
 */

/**
 * Cregis signature: MD5 over the API key followed by every non-empty parameter
 * (excluding `sign`) as `keyvalue`, with keys sorted in ascending ASCII order.
 * See developer.cregis.com/api-reference/signature.
 */
export function cregisSign(params: Record<string, unknown>, apiKey: string): string {
  const joined = Object.keys(params)
    .filter((key) => key !== 'sign')
    .filter((key) => {
      const value = params[key]
      return value !== undefined && value !== null && value !== ''
    })
    .sort()
    .map((key) => {
      const value = params[key]
      const serialised = typeof value === 'object' ? JSON.stringify(value) : String(value)
      return `${key}${serialised}`
    })
    .join('')

  return createHash('md5').update(`${apiKey}${joined}`, 'utf8').digest('hex')
}

/** Length-safe, constant-time-ish comparison for the inbound webhook signature. */
export function signaturesMatch(expected: string, received: string): boolean {
  if (typeof received !== 'string' || expected.length !== received.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ received.charCodeAt(i)
  }
  return diff === 0
}

/**
 * Cregis requires `nonce` to be a 6-character random string — not a timestamp.
 * The previous 13-digit epoch was rejected by the API.
 */
export function cregisNonce(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)]
  }
  return out
}

/** Minutes a checkout stays payable. Cregis accepts 10–1440. */
export const CHECKOUT_VALID_MINUTES = 60

export type CallbackOrder = {
  status: string
  orderId: string
  cregisOrderId: string
}

/**
 * Pull the order out of a payment callback.
 *
 * Cregis nests the order under `data` while keeping pid/nonce/timestamp/sign on the
 * envelope (API reference → Callback → Payment notify). Reading `order_id` off the
 * envelope finds nothing, so no order ever matches and no buyer is ever granted access.
 * The flat read is kept as a fallback so a future envelope-shaped payload still works.
 */
export function unwrapCallbackOrder(payload: Record<string, unknown>): CallbackOrder {
  const data = (
    payload.data && typeof payload.data === 'object' ? payload.data : payload
  ) as Record<string, unknown>

  const status = String(data.status ?? data.order_status ?? payload.status ?? '').toLowerCase()
  const orderId = String(data.order_id ?? payload.order_id ?? '')
  const cregisOrderId = String(
    data.cregis_id ?? data.trade_id ?? payload.cregis_id ?? orderId,
  )

  return { status, orderId, cregisOrderId }
}

/**
 * Statuses that mean the money arrived.
 *
 * `paid_over` is an overpayment — the buyer paid too much, which is a support
 * conversation, not a reason to withhold what they bought. `paid_partial` is an
 * underpayment and deliberately does NOT appear here.
 */
const PAID_STATUSES = ['paid', 'paid_over', 'success', 'succeeded', 'completed', 'confirmed']

export function isPaidStatus(status: string): boolean {
  return PAID_STATUSES.includes(status)
}

export function isUnderpaid(status: string): boolean {
  return status === 'paid_partial'
}
