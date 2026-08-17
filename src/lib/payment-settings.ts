import 'server-only'

import { appBaseUrl, isPlaceholder } from '@/lib/env'
import { type CregisSource, resolveCregisSettings } from '@/lib/cregis-settings'

/**
 * What is configured for taking money, and what is merely claimed to be.
 *
 * **This module never returns a secret.** It reports whether a variable is set, how long
 * it is, and — for Stripe keys only — whether it is a live or a test key, because that
 * one fact is the difference between taking real money and taking none while everything
 * appears to work. Nothing here puts a credential into a page, a bundle or a log line.
 *
 * **Stripe's credentials are environment-only.** That key can move money out of the
 * account — charges, refunds, payouts — so it stays where only a deployment can change
 * it, and this module reports on `process.env` for those rows.
 *
 * **Cregis is editable from the console**, because the owner's account there is
 * deposit-only: the worst an exposed key permits is receiving money. Being able to rotate
 * it without a redeploy is worth more than the marginal secrecy, and the stored value is
 * encrypted at rest. Those rows therefore report the *resolved* value — console first,
 * environment second — because showing `process.env` would name a variable no longer in
 * use. See src/lib/cregis-settings.ts.
 *
 * That asymmetry is the design, and it is not an accident of convenience: the credential
 * that can take money out is the one that stays hardest to change.
 */

export type SettingStatus = 'set' | 'missing' | 'placeholder'

export type SettingRow = {
  key: string
  label: string
  what: string
  status: SettingStatus
  /** Safe to display: never the value itself, only a shape or a mode. */
  detail: string | null
  secret: boolean
}

function statusOf(key: string): SettingStatus {
  const raw = process.env[key]
  if (raw === undefined || raw.trim() === '') return 'missing'
  if (isPlaceholder(raw)) return 'placeholder'
  return 'set'
}

/**
 * Live or test, read from the key's own prefix.
 *
 * Stripe keys are self-describing: `sk_live_…` and `sk_test_…`. Surfacing this is the
 * single most useful thing this page does — a deployment on test keys processes checkouts
 * that look completely successful, issue codes and send receipts, while no money moves.
 */
function stripeKeyMode(raw: string | undefined): string | null {
  if (!raw) return null
  if (raw.startsWith('sk_live_') || raw.startsWith('rk_live_')) return 'Live key'
  if (raw.startsWith('sk_test_') || raw.startsWith('rk_test_')) return 'TEST key — no real money moves'
  return 'Unrecognised key format'
}

function lengthDetail(raw: string | undefined): string | null {
  return raw ? `${raw.length} characters` : null
}

export function stripeSettings(): SettingRow[] {
  const secret = process.env.STRIPE_SECRET_KEY
  const price = process.env.STRIPE_PRICE_ID

  return [
    {
      key: 'STRIPE_SECRET_KEY',
      label: 'Secret key',
      what: 'Authorises this app to create checkouts on your Stripe account.',
      status: statusOf('STRIPE_SECRET_KEY'),
      detail: stripeKeyMode(secret),
      secret: true,
    },
    {
      key: 'STRIPE_PRICE_ID',
      label: 'Price',
      what:
        'The fallback recurring price, used only by packages that carry no Stripe price of ' +
        'their own. A one-off price will not subscribe anyone.',
      status: statusOf('STRIPE_PRICE_ID'),
      // A price id is not a credential — it appears in the checkout call itself — so
      // showing it in full is what makes it checkable against the Stripe dashboard.
      detail: price && !isPlaceholder(price) ? price : null,
      secret: false,
    },
    {
      key: 'STRIPE_WEBHOOK_SECRET',
      label: 'Webhook signing secret',
      what: 'Proves a webhook really came from Stripe. Without it, payments are never confirmed.',
      status: statusOf('STRIPE_WEBHOOK_SECRET'),
      detail: lengthDetail(process.env.STRIPE_WEBHOOK_SECRET),
      secret: true,
    },
  ]
}

/**
 * What Cregis will actually use, from whichever source is winning.
 *
 * Unlike the Stripe rows above, these are not a report on the environment: a value set in
 * the console overrides Vercel, so reading `process.env` here would show an operator the
 * variable they are no longer using.
 */
export async function cregisSettings(): Promise<SettingRow[]> {
  const resolved = await resolveCregisSettings()
  const from = (source: CregisSource) =>
    source === 'console' ? 'set in the admin console' : source === 'environment' ? 'set in Vercel' : null

  const row = (
    key: string,
    label: string,
    what: string,
    field: { value: string | null; source: CregisSource },
    reveal = false,
  ): SettingRow => ({
    key,
    label,
    what,
    status: field.source === 'unset' ? 'missing' : 'set',
    detail: field.value
      ? [reveal ? field.value : lengthDetail(field.value), from(field.source)]
          .filter(Boolean)
          .join(' · ')
      : null,
    secret: !reveal,
  })

  return [
    row(
      'CREGIS_PROJECT_ID',
      'Project ID',
      'Identifies your Cregis project on every call and in every callback signature.',
      resolved.projectId,
    ),
    row(
      'CREGIS_API_KEY',
      'API key',
      'Signs outbound requests and verifies inbound callbacks. Never leaves the server.',
      resolved.apiKey,
    ),
    row(
      'CREGIS_BASE_URL',
      'API base URL',
      'The Cregis endpoint this app calls. Given to you in the Cregis Developer Center.',
      resolved.baseUrl,
      true,
    ),
    {
      key: 'cregis.callbackIps',
      label: 'Callback IP allowlist',
      what: 'Optional. When set, only these addresses may deliver a payment callback.',
      status: resolved.callbackIps.value.length > 0 ? 'set' : 'missing',
      detail:
        resolved.callbackIps.value.length > 0
          ? resolved.callbackIps.value.join(', ')
          : 'Off — every source is accepted, and the signature check is what authorises the callback.',
      secret: false,
    },
  ]
}

/**
 * The URLs that must be registered with each processor.
 *
 * Derived from `APP_BASE_URL` rather than written down, because the commonest cause of
 * "the payment succeeded but nothing happened" is a webhook still pointing at a previous
 * domain. If the base URL below is wrong, everything on this page is wrong with it.
 */
export function processorUrls() {
  const base = appBaseUrl()
  return {
    base,
    stripeWebhook: `${base}/api/webhooks/stripe`,
    cregisCallback: `${base}/api/webhooks/cregis`,
    checkoutSuccess: `${base}/checkout/success`,
    checkoutCancelled: `${base}/checkout/cancelled`,
  }
}

/** Events the Stripe endpoint must be subscribed to for billing to work end to end. */
export const REQUIRED_STRIPE_EVENTS = [
  'checkout.session.completed',
  'invoice.paid',
  'customer.subscription.updated',
  'customer.subscription.deleted',
] as const
