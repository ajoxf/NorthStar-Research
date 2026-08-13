import 'server-only'

import { createHash } from 'crypto'

import { MissingConfigError, PLAN, appBaseUrl, isConfigured, requireEnvAll } from '@/lib/env'

/**
 * Cregis crypto-checkout client.
 *
 * ---------------------------------------------------------------------------
 * OPEN PRE-LAUNCH ITEM — STATIC OUTBOUND IP
 * ---------------------------------------------------------------------------
 * Cregis allowlists the IP that calls its API. Vercel serverless functions have NO
 * static outbound IP by default, so these calls will originate from a rotating pool
 * and will be rejected once allowlisting is enforced. This build deliberately does
 * NOT pick a solution; `CREGIS_ALLOWLISTED_IP` is a placeholder so the decision is
 * not forgotten. Before go-live, choose one of:
 *   1. Vercel Secure Compute / static IP add-on;
 *   2. an outbound proxy with a fixed IP (QuotaGuard Static, Fixie) that these calls
 *      route through;
 *   3. isolating just these Cregis calls into a small always-on service (cheap VPS,
 *      Railway, Fly) with a genuinely static IP, called from this app.
 * This is an open decision for the client, not a build blocker.
 * ---------------------------------------------------------------------------
 */

export const CREGIS_ENV_KEYS = ['CREGIS_PROJECT_ID', 'CREGIS_API_KEY', 'CREGIS_BASE_URL'] as const

export function cregisConfigured(): boolean {
  return isConfigured(...CREGIS_ENV_KEYS)
}

function cregisConfig() {
  // Throws MissingConfigError naming every unset key. Section 5.1: a placeholder must
  // never be mistaken for a working integration, so this is noisy by design.
  const env = requireEnvAll([...CREGIS_ENV_KEYS], 'Cregis checkout')
  return {
    projectId: env.CREGIS_PROJECT_ID,
    apiKey: env.CREGIS_API_KEY,
    baseUrl: env.CREGIS_BASE_URL.replace(/\/$/, ''),
  }
}

/**
 * Cregis signature: MD5 over the API key followed by every non-empty parameter
 * (excluding `sign` itself) as `keyvalue`, with keys sorted in ascending ASCII order.
 * See developer.cregis.com/api-reference/signature.
 *
 * Exported so the webhook route can verify inbound callbacks with the same code path
 * that signs outbound requests — one implementation, one place to be wrong.
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
      const serialised =
        typeof value === 'object' ? JSON.stringify(value) : String(value)
      return `${key}${serialised}`
    })
    .join('')

  return createHash('md5').update(`${apiKey}${joined}`, 'utf8').digest('hex')
}

/** Constant-time-ish comparison for the inbound webhook signature. */
export function signaturesMatch(expected: string, received: string): boolean {
  if (typeof received !== 'string' || expected.length !== received.length) return false
  let diff = 0
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ received.charCodeAt(i)
  }
  return diff === 0
}

export function verifyCregisCallback(payload: Record<string, unknown>): boolean {
  const { apiKey } = cregisConfig()
  const received = typeof payload.sign === 'string' ? payload.sign : ''
  if (!received) return false
  return signaturesMatch(cregisSign(payload, apiKey), received.toLowerCase())
}

export type CreateCheckoutInput = {
  /** Our internal CheckoutOrder id, echoed back on the callback. */
  orderId: string
  email: string
}

export type CreateCheckoutResult = {
  /** Hosted Cregis checkout page the buyer is redirected to. */
  checkoutUrl: string
  cregisOrderId: string
  raw: unknown
}

export async function createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
  const { projectId, apiKey, baseUrl } = cregisConfig()
  const base = appBaseUrl()

  const params: Record<string, unknown> = {
    project_id: projectId,
    order_id: input.orderId,
    order_amount: PLAN.amount,
    order_currency: PLAN.currency,
    product_name: PLAN.name,
    payer_email: input.email,
    nonce: Date.now().toString(),
    // The browser is sent to success_url, but access is NEVER granted from it —
    // only the server-to-server callback below can mint a redemption code.
    success_url: `${base}/checkout/success`,
    cancel_url: `${base}/checkout/cancelled`,
    callback_url: `${base}/api/webhooks/cregis`,
  }
  params.sign = cregisSign(params, apiKey)

  const response = await fetch(`${baseUrl}/api/v2/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    cache: 'no-store',
  })

  const raw = (await response.json().catch(() => null)) as Record<string, unknown> | null

  if (!response.ok || !raw) {
    throw new CregisError(
      `Cregis checkout failed with HTTP ${response.status}. Response: ${JSON.stringify(raw)}`,
    )
  }

  // Cregis wraps the payload in `data` and signals success with code "00000".
  const code = String(raw.code ?? '')
  if (code && code !== '00000') {
    throw new CregisError(`Cregis rejected the checkout (code ${code}): ${String(raw.msg ?? '')}`)
  }

  const data = (raw.data ?? raw) as Record<string, unknown>
  const checkoutUrl = String(data.checkout_url ?? data.payment_url ?? '')
  const cregisOrderId = String(data.cregis_id ?? data.order_id ?? input.orderId)

  if (!checkoutUrl) {
    throw new CregisError(
      `Cregis response did not include a checkout URL. Raw response: ${JSON.stringify(raw)}`,
    )
  }

  return { checkoutUrl, cregisOrderId, raw }
}

export class CregisError extends Error {
  name = 'CregisError'
}

export { MissingConfigError }
