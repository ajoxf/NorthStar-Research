import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { MissingConfigError, addBillingPeriod, appBaseUrl } from '@/lib/env'
import { codeExpiresAt, generateRedemptionCode } from '@/lib/codes'
import { getNotificationProvider } from '@/lib/notifications'
import { verifyStripeWebhook, type Stripe } from '@/lib/stripe'
import { recordReferralConversion } from '@/lib/referral-attribution'

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

  const code = generateRedemptionCode()
  // The order is authoritative; the session metadata catches a callback that arrives
  // before the order row landed.
  const sectionId = existingOrder?.sectionId ?? session.metadata?.sectionId ?? null

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
        stripeSubscriptionId: subscriptionId ?? null,
      },
      update: {
        status: 'paid',
        paidAt: new Date(),
        rawCallback: session as never,
        stripeSubscriptionId: subscriptionId ?? undefined,
      },
    })

    await tx.redemptionCode.create({
      // Expiry runs from payment: the buyer has the code the moment this callback lands.
      data: {
        code,
        cregisOrderId: session.id,
        email,
        status: 'unused',
        // Bought at list price, so no discount to record.
        discountPercent: 0,
        expiresAt: codeExpiresAt(),
        // Read off the order this session created, not off the session: the order is
        // where the package the buyer chose was recorded, and it is what carries that
        // choice forward to the membership they end up with.
        packageId: existingOrder?.packageId ?? null,
        /*
         * Which section was bought, carried code-first.
         *
         * Read from the session metadata as well as the order: the order is written when
         * checkout starts and is authoritative, but a session created before that row
         * landed would otherwise lose the section and silently grant all-access.
         */
        sectionId,
      },
    })

    /*
     * A section purchase must not rewrite the member's own membership.
     *
     * `stripeSubscriptionId` and `packageId` on Member describe the all-access
     * subscription. An existing all-access member buying a section would otherwise have
     * theirs overwritten by the section's, and the billing portal would then manage — or
     * cancel — the wrong one. The section's subscription is carried on the order instead,
     * and attached to the entitlement at redemption.
     */
    const boughtSection = Boolean(sectionId)
    await tx.member.upsert({
      where: { email },
      create: {
        email,
        source: 'stripe_checkout',
        subscriptionStatus: 'pending',
        billingProvider: 'stripe',
        stripeCustomerId: customerId ?? null,
        stripeSubscriptionId: boughtSection ? null : (subscriptionId ?? null),
        packageId: boughtSection ? null : (existingOrder?.packageId ?? null),
      },
      update: {
        billingProvider: 'stripe',
        stripeCustomerId: customerId ?? undefined,
        ...(boughtSection
          ? {}
          : {
              stripeSubscriptionId: subscriptionId ?? undefined,
              packageId: existingOrder?.packageId ?? undefined,
            }),
      },
    })
  })

  // A receipt for a payment that actually happened. Stripe emails its own receipt only
  // if that is switched on in the dashboard, and it carries Stripe's branding rather
  // than ours — this one is ours and always sends.
  try {
    const receipt = await getNotificationProvider().sendReceiptEmail(
      { email },
      {
        amount: ((session.amount_total ?? 19900) / 100).toFixed(2),
        currency: (session.currency ?? 'usd').toUpperCase(),
        method: 'Card',
        reference: session.id,
        paidAt: new Date(),
      },
    )
    if (receipt.status === 'failed') {
      console.error(`[stripe:webhook] receipt failed for ${email}: ${receipt.error}`)
    }
  } catch (error) {
    console.error('[stripe:webhook] receipt threw', error)
  }

  // Credit the affiliate, if this buyer came through one. Never throws — see the note in
  // referral-attribution.ts: the payment is real whatever bookkeeping does.
  await recordReferralConversion(email, Math.round((session.amount_total ?? 19900) / 100))

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
 * Which thing is this Stripe subscription?
 *
 * One customer can now hold several at once — all-access plus a section, or two sections
 * — so the customer no longer identifies what an invoice or a cancellation is about. The
 * subscription does. An id matching an Entitlement is a section; anything else is the
 * member's own all-access membership, which is what every subscription was before
 * sections existed.
 */
async function entitlementForSubscription(subscriptionId: string | null | undefined) {
  if (!subscriptionId) return null
  return db.entitlement.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { id: true, memberId: true, renewsAt: true, startedAt: true },
  })
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

  /*
   * Extend the thing that was actually billed.
   *
   * Without this branch a section's second invoice would set subscriptionStatus active on
   * the member and hand a single-section buyer the entire archive — the exact upgrade the
   * access model exists to prevent, arriving through the renewal door.
   */
  const subscriptionId =
    typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription?.id
  const entitlement = await entitlementForSubscription(subscriptionId)

  if (entitlement) {
    await db.entitlement.update({
      where: { id: entitlement.id },
      data: {
        status: 'active',
        renewsAt,
        startedAt: entitlement.startedAt ?? new Date(),
        cancelAtPeriodEnd: false,
      },
    })
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

  const member = await db.member.findFirst({ where: { stripeCustomerId: customerId } })
  if (!member) return

  const entitlement = await entitlementForSubscription(subscription.id)
  if (entitlement) {
    await db.entitlement.update({
      where: { id: entitlement.id },
      data: {
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        renewsAt: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000)
          : entitlement.renewsAt,
        ...(subscription.status === 'canceled' ? { status: 'cancelled' as const } : {}),
      },
    })
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

  const member = await db.member.findFirst({ where: { stripeCustomerId: customerId } })
  if (!member) return

  // Cancelling one section must not cancel the member, nor their other sections.
  const entitlement = await entitlementForSubscription(subscription.id)
  if (entitlement) {
    await db.entitlement.update({
      where: { id: entitlement.id },
      data: { status: 'cancelled', cancelAtPeriodEnd: true },
    })
    return
  }

  await db.member.update({
    where: { id: member.id },
    data: { subscriptionStatus: 'cancelled', cancelAtPeriodEnd: true },
  })
}
