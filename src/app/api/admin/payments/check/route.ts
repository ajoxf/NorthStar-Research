import { NextResponse } from 'next/server'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { PLAN } from '@/lib/env'
import { REQUIRED_STRIPE_EVENTS, processorUrls } from '@/lib/payment-settings'
import { cregisConfigured } from '@/lib/cregis'
import { stripeClient, stripeConfigured } from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Ask the processors whether the configuration actually works.
 *
 * Presence checks are not enough. A key can be present and revoked; a price can exist and
 * be one-off rather than recurring; a webhook endpoint can be registered against a domain
 * the site no longer uses. Each of those produces a checkout that looks fine to the buyer
 * and never results in a member.
 *
 * Read-only by construction: it retrieves a price and lists webhook endpoints. It creates
 * no charge, no customer and no order. There is no Cregis equivalent — their API has no
 * read-only endpoint that does not involve opening an order, and this is not a place to
 * open one — so Cregis is reported on configuration alone, which is stated rather than
 * implied.
 */

export type CheckResult = {
  label: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
}

export async function POST() {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const urls = processorUrls()
  const stripe: CheckResult[] = []
  const cregis: CheckResult[] = []

  if (!stripeConfigured()) {
    stripe.push({
      label: 'Credentials',
      status: 'fail',
      detail: 'Stripe is not configured, so card payments cannot be taken.',
    })
  } else {
    try {
      const client = stripeClient()
      const price = await client.prices.retrieve(process.env.STRIPE_PRICE_ID as string)

      stripe.push({
        label: 'Secret key',
        status: 'ok',
        detail: 'Stripe accepted the key.',
      })

      if (!price.active) {
        stripe.push({
          label: 'Price',
          status: 'fail',
          detail: 'That price is archived in Stripe. Checkout will fail for every buyer.',
        })
      } else if (price.type !== 'recurring' || price.recurring?.interval !== 'month') {
        stripe.push({
          label: 'Price',
          status: 'fail',
          detail:
            `That price is ${price.type === 'recurring' ? `recurring every ${price.recurring?.interval}` : 'one-off'}. ` +
            'It must be a monthly recurring price, or nobody is actually subscribed and no renewal is ever charged.',
        })
      } else {
        const amount = (price.unit_amount ?? 0) / 100
        const currency = (price.currency ?? '').toUpperCase()
        const matches = amount === PLAN.priceUsd && currency === PLAN.currency

        stripe.push({
          label: 'Price',
          status: matches ? 'ok' : 'warn',
          detail: matches
            ? `${currency} ${amount.toFixed(2)} per month, recurring.`
            : `Stripe will charge ${currency} ${amount.toFixed(2)} per month, but the site advertises ` +
              `${PLAN.currency} ${PLAN.priceUsd}.00. The buyer is charged what Stripe says.`,
        })
      }

      // A registered endpoint on the wrong domain is the classic cause of "they paid and
      // nothing happened": Stripe reports the payment as successful and this app never
      // hears about it.
      try {
        const endpoints = await client.webhookEndpoints.list({ limit: 100 })
        const match = endpoints.data.find((endpoint) => endpoint.url === urls.stripeWebhook)

        if (!match) {
          const others = endpoints.data.map((endpoint) => endpoint.url)
          stripe.push({
            label: 'Webhook',
            status: 'fail',
            detail:
              `No Stripe webhook points at ${urls.stripeWebhook}. Payments will succeed and ` +
              `no membership will be created.` +
              (others.length ? ` Registered instead: ${others.join(', ')}.` : ''),
          })
        } else if (match.status !== 'enabled') {
          stripe.push({
            label: 'Webhook',
            status: 'fail',
            detail: `The endpoint exists but is ${match.status} in Stripe.`,
          })
        } else {
          const enabled = match.enabled_events ?? []
          const wildcard = enabled.includes('*')
          const missing = REQUIRED_STRIPE_EVENTS.filter(
            (event) => !wildcard && !enabled.includes(event),
          )

          stripe.push({
            label: 'Webhook',
            status: missing.length ? 'warn' : 'ok',
            detail: missing.length
              ? `Endpoint found, but not subscribed to: ${missing.join(', ')}.`
              : 'Endpoint found, enabled, and subscribed to every event this app needs.',
          })
        }
      } catch {
        // Listing endpoints needs a permission a restricted key may not carry. That is
        // not a billing fault, so it must not be reported as one.
        stripe.push({
          label: 'Webhook',
          status: 'warn',
          detail:
            'Could not read the webhook list — a restricted key may not have permission. ' +
            'Check the endpoint by hand in the Stripe dashboard.',
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      stripe.push({
        label: 'Stripe',
        status: 'fail',
        detail: message.includes('No such price')
          ? 'Stripe accepted the key but does not recognise that price ID. Check it belongs to this account, and to the same live/test mode as the key.'
          : `Stripe rejected the request: ${message}`,
      })
    }
  }

  cregis.push(
    cregisConfigured()
      ? {
          label: 'Credentials',
          status: 'ok',
          detail:
            'All three values are set. Cregis has no read-only endpoint to verify them ' +
            'against without opening an order, so this confirms configuration, not acceptance.',
        }
      : {
          label: 'Credentials',
          status: 'fail',
          detail: 'Cregis is not configured, so crypto checkout is unavailable.',
        },
  )

  cregis.push({
    label: 'Callback URL',
    status: 'warn',
    detail:
      `Cregis must be configured to call ${urls.cregisCallback}. This cannot be read back ` +
      `from their API — confirm it in the Cregis Developer Center.`,
  })

  return NextResponse.json({ stripe, cregis, checkedUrl: urls.base })
}
