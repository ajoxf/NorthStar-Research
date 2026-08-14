import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { MissingConfigError, addBillingPeriod, appBaseUrl } from '@/lib/env'
import { generateRedemptionCode } from '@/lib/codes'
import { getNotificationProvider } from '@/lib/notifications'
import { verifyStripeWebhook, type Stripe } from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Stripe webhook — the only place a card subscription grants or extends access.
 *
 * Same rule as the Cregis webhook: the browser hitting /checkout/success proves nothing,
 * so access is granted here, against a signature-verified event, or not at all.
 *
 * Events handled:
 *   checkout.session.completed  → first payment; issue a redemption code
 *   invoice.paid                → every renewal; extend the paid period
 *   customer.subscription.updated → cancel-at-period-end flag, plan changes
 *   customer.subscription.deleted → subscription ended; let access lapse at period end
 */
export async function POST(request: Request) {
  const payload = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'missing signature' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = verifyStripeWebhook(payload, signature)
  } catch (error) {
    if (error instanceof MissingConfigError) {
      console.error(
        `[stripe:webhook] REJECTED — ${error.message} No payment can be processed until real ` +
          `Stripe credentials are set. This event was NOT actioned.`,
      )
      return NextResponse.json({ error: 'billing not configured' }, { status: 503 })
    }
    console.error('[stripe:webhook] signature verification failed', error)
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object)
        break
      case 'invoice.paid':
        await handleInvoicePaid(event.data.object)
        break
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object)
        break
      default:
        // Stripe sends a lot we do not care about; acknowledge so it stops retrying.
        break
    }
  } catch (error) {
    console.error(`[stripe:webhook] handler for ${event.type} threw`, error)
    // 500 tells Stripe to retry, which is what we want for a transient database error.
    return NextResponse.json({ error: 'handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

/** First successful payment: create the contact and issue a one-time redemption code. */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const email = (session.customer_email ?? session.client_reference_id ?? '').toLowerCase()
  if (!email) {
    console.error('[stripe:webhook] checkout.session.completed with no email')
    return
  }

  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
  const subscriptionId =
    typeof session.subscription === 'string' ? session.subscription : session.subscription?.id

  const existingOrder = await db.checkoutOrder.findUnique({
    where: { cregisOrderId: session.id },
  })
  // Stripe retries webhooks; issuing a second code for one payment would be wrong.
  if (existingOrder?.status === 'paid') return

  const code = generateRedemptionCode()

  await db.$transaction(async (tx) => {
    await tx.checkoutOrder.upsert({
      where: { cregisOrderId: session.id },
      create: {
        cregisOrderId: session.id,
        provider: 'stripe',
        email,
        amount: ((session.amount_total ?? 19900) / 100).toFixed(2),
        currency: (session.currency ?? 'usd').toUpperCase(),
        status: 'paid',
        paidAt: new Date(),
        rawCallback: session as never,
      },
      update: { status: 'paid', paidAt: new Date(), rawCallback: session as never },
    })

    await tx.redemptionCode.create({
      data: { code, cregisOrderId: session.id, email, status: 'unused' },
    })

    await tx.member.upsert({
      where: { email },
      create: {
        email,
        source: 'stripe_checkout',
        subscriptionStatus: 'pending',
        billingProvider: 'stripe',
        stripeCustomerId: customerId ?? null,
        stripeSubscriptionId: subscriptionId ?? null,
      },
      update: {
        billingProvider: 'stripe',
        stripeCustomerId: customerId ?? undefined,
        stripeSubscriptionId: subscriptionId ?? undefined,
      },
    })
  })

  const redeemUrl = `${appBaseUrl()}/redeem?code=${encodeURIComponent(code)}`
  try {
    const result = await getNotificationProvider().sendRedemptionCodeEmail({ email }, code, redeemUrl)
    if (result.status === 'failed') {
      console.error(`[stripe:webhook] code ${code} issued but email failed: ${result.error}`)
    }
  } catch (error) {
    console.error(`[stripe:webhook] code ${code} issued but email threw`, error)
  }
}

/**
 * Every successful charge, including the first — extend the paid period.
 *
 * This is what makes the subscription recurring from the member's point of view: their
 * access simply keeps moving forward as long as Stripe keeps collecting.
 */
async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!customerId) return

  const member = await db.member.findFirst({ where: { stripeCustomerId: customerId } })
  if (!member) {
    // Normal on the very first invoice: the member redeems their code moments later, and
    // redemption sets the initial period itself.
    return
  }

  // Prefer Stripe's own period end so our dates never drift from what was billed.
  const periodEnd = invoice.lines?.data?.[0]?.period?.end
  const renewsAt = periodEnd ? new Date(periodEnd * 1000) : addBillingPeriod()

  await db.member.update({
    where: { id: member.id },
    data: {
      subscriptionStatus: 'active',
      subscriptionRenewsAt: renewsAt,
      subscriptionStartedAt: member.subscriptionStartedAt ?? new Date(),
      renewalReminderSentAt: null,
    },
  })
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
  if (!customerId) return

  const member = await db.member.findFirst({ where: { stripeCustomerId: customerId } })
  if (!member) return

  await db.member.update({
    where: { id: member.id },
    data: {
      stripeSubscriptionId: subscription.id,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      subscriptionRenewsAt: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : member.subscriptionRenewsAt,
      // past_due keeps access until the period actually ends, so Stripe's retries have a
      // chance to succeed before anyone is locked out over a temporary card failure.
      subscriptionStatus: subscription.status === 'canceled' ? 'cancelled' : member.subscriptionStatus,
    },
  })
}

/** Subscription ended. Access still runs to the end of the period already paid for. */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
  if (!customerId) return

  const member = await db.member.findFirst({ where: { stripeCustomerId: customerId } })
  if (!member) return

  await db.member.update({
    where: { id: member.id },
    data: { subscriptionStatus: 'cancelled', cancelAtPeriodEnd: true },
  })
}
