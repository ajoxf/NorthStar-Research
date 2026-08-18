import 'server-only'

import { MissingConfigError, PLAN, appBaseUrl } from '@/lib/env'
import { resolveCregisSettings } from '@/lib/cregis-settings'
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
 * Cregis allowlists the IP that calls its API and will not disable that check.
 * Vercel functions have no static outbound IP, so calls made directly from here
 * are rejected with `E0001 — The IP is not added to the whitelist`.
 *
 * Production therefore routes this one call through a PHP relay on fixed-IP
 * hosting; that server's address is on the Cregis allowlist. See
 * CREGIS_RELAY_URL below. With the relay unset the call goes direct, which is
 * correct for local development from an allowlisted machine.
 *
 * If checkouts start failing with an IP error, the relay host's address has
 * changed and needs re-allowlisting. Open the relay URL in a browser — it
 * prints its current outbound address.
 *
 * Note what the relay takes over: when CREGIS_RELAY_URL is set, the relay owns
 * the Cregis hostname and CREGIS_BASE_URL is no longer used for this call. That
 * matters because CREGIS_BASE_URL is editable from the admin console, where it
 * looks live — changing it in production changes nothing while the relay is in
 * front. It is still required, and is still what a direct call uses.
 * ---------------------------------------------------------------------------
 */

/**
 * How long to wait on the outbound call before giving up.
 *
 * The relay adds a hop on hosting we do not control, and a stalled request is
 * worse than a failed one: it holds the serverless function open until the
 * platform kills it, and the buyer watches a spinner the whole time. Failing at
 * twenty seconds leaves the order recorded as `failed`, which is a state the
 * payments list can show and an operator can act on.
 */
const OUTBOUND_TIMEOUT_MS = 20_000

/** The relay's host, for error messages. Never its secret. */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'the configured relay'
  }
}

export const CREGIS_ENV_KEYS = ['CREGIS_PROJECT_ID', 'CREGIS_API_KEY', 'CREGIS_BASE_URL'] as const

/**
 * Resolved from the admin console first, the environment second.
 *
 * Still throws MissingConfigError naming every unset key when neither source has one.
 * Section 5.1: a placeholder must never be mistaken for a working integration, so this
 * stays noisy by design — the only change is where a real value may come from.
 */
async function cregisConfig() {
  const settings = await resolveCregisSettings()

  const missing = ([
    ['CREGIS_PROJECT_ID', settings.projectId.value],
    ['CREGIS_API_KEY', settings.apiKey.value],
    ['CREGIS_BASE_URL', settings.baseUrl.value],
  ] as const)
    .filter(([, value]) => !value)
    .map(([key]) => key)

  if (missing.length > 0) throw new MissingConfigError(missing, 'Cregis checkout')

  return {
    projectId: settings.projectId.value as string,
    apiKey: settings.apiKey.value as string,
    baseUrl: (settings.baseUrl.value as string).replace(/\/$/, ''),
  }
}

export async function cregisConfigured(): Promise<boolean> {
  const settings = await resolveCregisSettings()
  return Boolean(settings.projectId.value && settings.apiKey.value && settings.baseUrl.value)
}

export async function verifyCregisCallback(payload: Record<string, unknown>): Promise<boolean> {
  const { apiKey } = await cregisConfig()
  const received = typeof payload.sign === 'string' ? payload.sign : ''
  if (!received) return false
  return signaturesMatch(cregisSign(payload, apiKey), received.toLowerCase())
}

export type CreateCheckoutInput = {
  /** Our internal CheckoutOrder id, echoed back on the callback. */
  orderId: string
  email: string
  /**
   * Merchant-side identifier for the payer. Defaults to the order id.
   *
   * Not the email: Cregis caps this field at 32 characters and plenty of real
   * addresses are longer. The email travels in `payer_email`, which has no such limit.
   */
  payerId?: string
  /**
   * What to charge, as a two-decimal string. Comes from the package being bought;
   * defaults to the built-in plan when no package has been created.
   *
   * Unlike Stripe, Cregis has no stored Price object of its own — it charges whatever
   * this call says — so here the package price *is* the price charged, with nothing to
   * diverge from.
   */
  amount?: string
  currency?: string
  /** Shown on the Cregis order. Defaults to the plan name. */
  remark?: string
}

export type CreateCheckoutResult = {
  /** Hosted Cregis checkout page the buyer is redirected to. */
  checkoutUrl: string
  cregisOrderId: string
  raw: unknown
}

export async function createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
  const { projectId, apiKey, baseUrl } = await cregisConfig()
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
    order_amount: input.amount ?? PLAN.amount,
    order_currency: input.currency ?? PLAN.currency,
    // Cregis documents payer_id as "no more than 32 characters" and plenty of real
    // email addresses exceed that. The order id is a 25-character cuid, and the email
    // is already carried properly in payer_email below.
    payer_id: input.payerId ?? input.orderId,
    payer_email: input.email,
    valid_time: CHECKOUT_VALID_MINUTES,
    remark: input.remark ?? PLAN.name,
    // The browser is sent to success_url, but access is NEVER granted from it —
    // only the server-to-server callback below can mint a redemption code.
    success_url: `${base}/checkout/success`,
    cancel_url: `${base}/checkout/cancelled`,
    callback_url: `${base}/api/webhooks/cregis`,
  }
  params.sign = cregisSign(params, apiKey)

  /*
   * Outbound call, optionally via the relay.
   *
   * Cregis allowlists the calling IP and Vercel has none that is stable, so in
   * production this goes through a small PHP relay on fixed-IP hosting. With
   * CREGIS_RELAY_URL unset the call goes direct, which is what local development
   * and any allowlisted machine should do.
   */
  const relayUrl = process.env.CREGIS_RELAY_URL
  const relaySecret = process.env.CREGIS_RELAY_SECRET

  if (relayUrl && !relaySecret) {
    // Failing loudly beats sending an unauthenticated request the relay will refuse
    // with a 401 that reads like a Cregis credential problem.
    throw new CregisError(
      'CREGIS_RELAY_URL is set but CREGIS_RELAY_SECRET is not. Set both or neither.',
    )
  }

  const viaRelay = Boolean(relayUrl)

  let response: Response
  try {
    response = viaRelay
      ? await fetch(relayUrl as string, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Relay-Secret': relaySecret as string,
            'X-Relay-Path': '/api/v2/checkout',
          },
          body: JSON.stringify(params),
          cache: 'no-store',
          signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
        })
      : await fetch(`${baseUrl}/api/v2/checkout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
          cache: 'no-store',
          signal: AbortSignal.timeout(OUTBOUND_TIMEOUT_MS),
        })
  } catch (error) {
    // Naming the hop is the whole point. "Cregis is down" sends an operator to the
    // Cregis dashboard and their credentials; the relay being unreachable is a
    // different problem with a different fix, and the two are indistinguishable from
    // the buyer's error message unless this says which one it was.
    const detail = error instanceof Error ? error.message : String(error)
    throw new CregisError(
      viaRelay
        ? `The Cregis relay at ${hostOf(relayUrl as string)} could not be reached (${detail}). ` +
          `This is the relay, not Cregis — check that host is up before touching any Cregis credential.`
        : `Cregis could not be reached (${detail}).`,
    )
  }

  const raw = (await response.json().catch(() => null)) as Record<string, unknown> | null

  /*
   * A relay fault, told apart from a Cregis rejection.
   *
   * Cregis answers in JSON, always. So when the relay is in front and the body is not
   * JSON at all — a PHP error page, an nginx 502 — the relay is what failed, and a 401
   * or 403 is almost certainly the relay refusing our secret rather than Cregis
   * refusing our key. Reporting either as "Cregis rejected the checkout" would send
   * someone to rotate a credential that was never the problem.
   */
  if (viaRelay && (!raw || response.status === 401 || response.status === 403)) {
    throw new CregisError(
      `The Cregis relay at ${hostOf(relayUrl as string)} returned HTTP ${response.status}` +
        `${raw ? '' : ' with a non-JSON body'}. This is the relay, not Cregis` +
        `${
          response.status === 401 || response.status === 403
            ? ' — that status usually means CREGIS_RELAY_SECRET does not match what the relay expects.'
            : '.'
        }`,
    )
  }

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
