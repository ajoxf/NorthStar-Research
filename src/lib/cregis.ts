import 'server-only'

import { MissingConfigError, PLAN, appBaseUrl, isConfigured, requireEnvAll } from '@/lib/env'
import {
  CHECKOUT_VALID_MINUTES,
  cregisNonce,
  cregisSign,
  signaturesMatch,
} from '@/lib/cregis-protocol'

export { cregisSign, signaturesMatch }

/**
 * Cregis crypto-checkout client.
 *
 * ---------------------------------------------------------------------------
 * OUTBOUND IP
 * ---------------------------------------------------------------------------
 * Cregis can allowlist the IP that calls its API, and Vercel serverless functions have
 * no static outbound IP — calls originate from a rotating pool. The owner has confirmed
 * a static outbound IP is not required for this account, so no proxy, Secure Compute
 * add-on or side service is wired up here.
 *
 * If a checkout ever starts failing with an authorisation or IP error while the
 * credentials are unchanged, this is the first thing to re-examine: a rejection on
 * source IP means the key is *correct* and the caller is simply not on the list.
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
  /** Merchant-side identifier for the payer. Defaults to the email. */
  payerId?: string
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

  // Parameter names and requirements follow developer.cregis.com → API reference →
  // Create Payment order (POST /api/v2/checkout). `pid`, `nonce`, `timestamp`,
  // `order_id`, `order_amount`, `order_currency`, `payer_id`, `valid_time`,
  // `success_url` and `cancel_url` are all REQUIRED. The previous version sent
  // `project_id`, a 13-digit epoch nonce and a `product_name` that does not exist in
  // the API, and omitted three required fields — every checkout would have been rejected.
  const params: Record<string, unknown> = {
    pid: Number(projectId),
    nonce: cregisNonce(),
    timestamp: Date.now(),
    order_id: input.orderId,
    order_amount: PLAN.amount,
    order_currency: PLAN.currency,
    payer_id: input.payerId ?? input.email,
    payer_email: input.email,
    valid_time: CHECKOUT_VALID_MINUTES,
    remark: PLAN.name,
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
