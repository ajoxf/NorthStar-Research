import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { addBillingPeriod } from '@/lib/env'
import { fulfilPaidOrder } from '@/lib/fulfilment'
import { getNotificationProvider } from '@/lib/notifications'
import { type Stripe } from '@/lib/payments/stripe'
import { stripeProvider } from '@/lib/payments/stripe-provider'
import { recordCardRenewal } from '@/lib/renewals'
import { resolveSubscription } from '@/lib/subscription-target'

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
  const verified = await stripeProvider.verifyWebhook(await request.text(), request.headers)
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status })
  }
  const event = verified.event

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

/** First successful payment: grant it, or issue a code to somebody without an account. See fulfilment.ts. */
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

  /*
   * An operator's configuration probe. Record it and grant nothing.
   *
   * Checked against both our own row and Stripe's metadata: the row is authoritative,
   * and the metadata catches the case where the order was never written because the
   * request died between creating the session and recording it. Either one is enough to
   * stop this from minting a membership.
   */
  if (existingOrder?.isTest || session.metadata?.nordstarTest === 'true') {
    await db.checkoutOrder.upsert({
      where: { cregisOrderId: session.id },
      create: {
        cregisOrderId: session.id,
        provider: 'stripe',
        email,
        amount: ((session.amount_total ?? 100) / 100).toFixed(2),
        currency: (session.currency ?? 'usd').toUpperCase(),
        status: 'paid',
        paidAt: new Date(),
        isTest: true,
        rawCallback: session as never,
      },
      update: { status: 'paid', paidAt: new Date(), rawCallback: session as never },
    })
    console.info(`[stripe:webhook] TEST session ${session.id} settled. Nothing granted.`)
    return
  }

  /*
   * The order this session paid for. checkout.ts writes it before Stripe is called, so it
   * is normally here. If it is not — the request died between Stripe answering and the
   * row being written — record one from the session, which grants the built-in plan as
   * this path always has, and say so loudly: a paid buyer must not be refused, and an
   * operator should look.
   */
  const order =
    existingOrder ??
    (await db.checkoutOrder.create({
      data: {
        cregisOrderId: session.id,
        provider: 'stripe',
        email,
        amount: ((session.amount_total ?? 19900) / 100).toFixed(2),
        currency: (session.currency ?? 'usd').toUpperCase(),
        status: 'pending',
      },
    }))
  if (!existingOrder) {
    console.error(`[stripe:webhook] session ${session.id} had no order on record — recorded one now; check it`)
  }

  await fulfilPaidOrder({
    order,
    provider: 'stripe',
    providerRef: session.id,
    methodLabel: 'Card',
    amount: ((session.amount_total ?? 0) / 100).toFixed(2),
    currency: (session.currency ?? order.currency).toUpperCase(),
    rawCallback: session,
    stripe: { customerId: customerId ?? null, subscriptionId: subscriptionId ?? null },
  })
}

/**
 * Which thing is this Stripe subscription? One customer can hold several at once — all-access
 * plus a section, or two packages — so the subscription, not the customer, says what an
 * invoice or a cancellation is about. See resolveSubscription in src/lib/subscription-target.ts.
 */
function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  return (typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id) ?? null
}

/**
 * The member a subscription event is about.
 *
 * By Stripe customer first. Each Checkout creates a customer, so somebody who has bought
 * by card before keeps their first customer id and a later subscription arrives under a
 * new one; for those, the order that started the subscription names the buyer.
 */
async function memberForSubscription(customerId: string, subscriptionId: string | null) {
  const byCustomer = await db.member.findFirst({ where: { stripeCustomerId: customerId } })
  if (byCustomer || !subscriptionId) return byCustomer
  const order = await db.checkoutOrder.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { email: true },
  })
  return order ? db.member.findUnique({ where: { email: order.email } }) : null
}

function logUnknown(event: string, subscriptionId: string | null | undefined, reason: string) {
  console.warn(`[stripe:webhook] ${event} for ${subscriptionId ?? 'no subscription'}: ${reason}. Nothing changed.`)
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

  const member = await memberForSubscription(customerId, invoiceSubscriptionId(invoice))
  if (!member) {
    // Normal on the very first invoice: the member redeems their code moments later, and
    // redemption sets the initial period itself.
    return
  }

  // Prefer Stripe's own period end so our dates never drift from what was billed.
  const periodEnd = invoice.lines?.data?.[0]?.period?.end
  const renewsAt = periodEnd ? new Date(periodEnd * 1000) : addBillingPeriod()

  /*
   * Extend the thing that was actually billed.
   *
   * Without this branch a section's second invoice would set subscriptionStatus active on
   * the member and hand a single-section buyer the entire archive — the exact upgrade the
   * access model exists to prevent, arriving through the renewal door.
   */
  const subscriptionId =
    typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id
  const target = await resolveSubscription(subscriptionId, member)

  if (target.kind === 'entitlements') {
    // Every item on this subscription moves to the same date. One payment, one period —
    // a bundle whose parts expired separately would be a bundle in name only.
    const rows = await db.entitlement.findMany({
      where: { id: { in: target.ids } },
      select: { id: true, startedAt: true },
    })
    await Promise.all(
      rows.map((entitlement) =>
        db.entitlement.update({
          where: { id: entitlement.id },
          data: {
            status: 'active',
            renewsAt,
            startedAt: entitlement.startedAt ?? new Date(),
            cancelAtPeriodEnd: false,
          },
        }),
      ),
    )
  } else if (target.kind === 'unknown') {
    logUnknown('invoice.paid', subscriptionId, target.reason)
  } else {
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

  /*
   * A receipt for the renewal — but never for the first invoice.
   *
   * `subscription_create` is the invoice raised by the original checkout, and
   * `checkout.session.completed` has already sent a receipt for that one. Sending on
   * every `invoice.paid` would give first-time buyers two receipts for one payment,
   * which reads as a double charge and generates precisely the support message a receipt
   * is meant to prevent. `billing_reason` is what tells the two apart.
   *
   * Every later renewal previously produced nothing from us at all: money left the
   * member's card each month in silence unless they had Stripe's own receipts switched on.
   */
  if (invoice.billing_reason !== 'subscription_cycle') return

  /*
   * The renewal as an order, so the money it took is paid out to the experts and, on
   * every-payment terms, credited to the affiliate — see renewals.ts. Never fails the
   * webhook: access has already been extended, and a missing order can be repaired by hand.
   */
  if (subscriptionId && target.kind !== 'unknown') {
    try {
      await recordCardRenewal({
        id: invoice.id ?? `inv_${subscriptionId}_${Date.now()}`,
        subscriptionId,
        amountPaidCents: invoice.amount_paid ?? 0,
        currency: invoice.currency ?? 'usd',
      })
    } catch (error) {
      console.error(`[stripe:webhook] renewal ${invoice.id} paid but not recorded as an order`, error)
    }
  }

  try {
    const receipt = await getNotificationProvider().sendReceiptEmail(
      { email: member.email, firstName: member.firstName },
      {
        amount: ((invoice.amount_paid ?? 0) / 100).toFixed(2),
        currency: (invoice.currency ?? 'usd').toUpperCase(),
        method: 'Card',
        reference: invoice.id ?? '',
        paidAt: new Date(),
      },
    )
    if (receipt.status === 'failed') {
      console.error(`[stripe:webhook] renewal receipt failed for ${member.email}: ${receipt.error}`)
    }
  } catch (error) {
    console.error('[stripe:webhook] renewal receipt threw', error)
  }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id
  if (!customerId) return

  const member = await memberForSubscription(customerId, subscription.id)
  if (!member) return

  // Every row on this subscription, because a package's items share one.
  const target = await resolveSubscription(subscription.id, member)
  if (target.kind === 'unknown') {
    logUnknown('customer.subscription.updated', subscription.id, target.reason)
    return
  }
  if (target.kind === 'entitlements') {
    const rows = await db.entitlement.findMany({
      where: { id: { in: target.ids } },
      select: { id: true, renewsAt: true },
    })
    await Promise.all(
      rows.map((entitlement) =>
        db.entitlement.update({
          where: { id: entitlement.id },
          data: {
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            renewsAt: subscription.current_period_end
              ? new Date(subscription.current_period_end * 1000)
              : entitlement.renewsAt,
            ...(subscription.status === 'canceled' ? { status: 'cancelled' as const } : {}),
          },
        }),
      ),
    )
    return
  }

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

  const member = await memberForSubscription(customerId, subscription.id)
  if (!member) return

  /*
   * Cancelling one section must not cancel the member, nor their other sections — and
   * cancelling a package must cancel all of it. Taking only the first row here would have
   * left the rest of a cancelled bundle live and renewing against a subscription Stripe
   * has already ended.
   */
  const target = await resolveSubscription(subscription.id, member)
  if (target.kind === 'unknown') {
    logUnknown('customer.subscription.deleted', subscription.id, target.reason)
    return
  }
  if (target.kind === 'entitlements') {
    await db.entitlement.updateMany({
      where: { id: { in: target.ids } },
      data: { status: 'cancelled', cancelAtPeriodEnd: true },
    })
    return
  }

  await db.member.update({
    where: { id: member.id },
    data: { subscriptionStatus: 'cancelled', cancelAtPeriodEnd: true },
  })
}
