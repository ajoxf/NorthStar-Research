import 'server-only'

import { PLAN, appBaseUrl, isPlaceholder } from '@/lib/env'

/**
 * What is configured for taking money, and what is merely claimed to be.
 *
 * **This module never returns a secret.** It reports whether a variable is set, how long
 * it is, and — for Stripe keys only — whether it is a live or a test key, because that
 * one fact is the difference between taking real money and taking none while everything
 * appears to work. Nothing here puts a credential into a page, a bundle or a log line.
 *
 * Credentials themselves are entered in Vercel and read from the environment. They are
 * deliberately not editable from this console and not stored in the database:
 *
 *   - A form that writes an API key to Postgres puts a live payment credential in a
 *     second place, in plain text, where a database dump or a read-only analytics
 *     connection would expose it.
 *   - It would also mean the key travels through a browser belonging to whoever is
 *     signed in as an admin at the time.
 *   - The environment is already the source of truth at runtime. Two sources of truth
 *     for a payment credential is how a deployment ends up charging against the wrong
 *     account.
 *
 * So this page tells the operator precisely what is wrong and exactly where to fix it,
 * which is the useful half, without becoming a place a live key can leak from.
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
      what: `Must be a recurring monthly price of $${PLAN.priceUsd}. A one-off price will not subscribe anyone.`,
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

export function cregisSettings(): SettingRow[] {
  const baseUrl = process.env.CREGIS_BASE_URL

  return [
    {
      key: 'CREGIS_PROJECT_ID',
      label: 'Project ID',
      what: 'Identifies your Cregis project on every call and in every callback signature.',
      status: statusOf('CREGIS_PROJECT_ID'),
      detail: lengthDetail(process.env.CREGIS_PROJECT_ID),
      secret: true,
    },
    {
      key: 'CREGIS_API_KEY',
      label: 'API key',
      what: 'Signs outbound requests and verifies inbound callbacks. Never leaves the server.',
      status: statusOf('CREGIS_API_KEY'),
      detail: lengthDetail(process.env.CREGIS_API_KEY),
      secret: true,
    },
    {
      key: 'CREGIS_BASE_URL',
      label: 'API base URL',
      what: 'The Cregis endpoint this app calls. Given to you in the Cregis Developer Center.',
      status: statusOf('CREGIS_BASE_URL'),
      detail: baseUrl && !isPlaceholder(baseUrl) ? baseUrl : null,
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
