import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { addBillingPeriod, appBaseUrl, MissingConfigError } from '@/lib/env'
import { verifyCregisCallback } from '@/lib/cregis'
import { isPaidStatus, isUnderpaid, unwrapCallbackOrder } from '@/lib/cregis-protocol'
import { codeExpiresAt, generateRedemptionCode } from '@/lib/codes'
import { recordReferralConversion } from '@/lib/referral-attribution'
import { getNotificationProvider } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Cregis treats a callback as delivered ONLY if the response body is the literal string
 * `success` — anything else, JSON included, is read as a failure and the callback is
 * retried. Returning `{"ok":true}` looks perfectly healthy in a log while quietly
 * producing an infinite retry loop against an already-processed order.
 */
function ack(): Response {
  return new Response('success', {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

/**
 * Cregis payment callback — the ONLY place a redemption code is ever minted.
 *
 * Requirement 5 is emphatic about this: access is granted here, on a signature-verified
 * server-to-server callback, and never from the browser reaching /checkout/success.
 * That page can be visited by anyone; this one cannot be forged without the API key.
 */
export async function POST(request: Request) {
  const raw = await request.text()

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(raw)
  } catch {
    console.error('[cregis:webhook] rejected — body was not valid JSON')
    return NextResponse.json({ error: 'invalid payload' }, { status: 400 })
  }

  try {
    if (!verifyCregisCallback(payload)) {
      // Never fall back to trusting the payload. An unverifiable callback is a hostile
      // callback as far as this route is concerned.
      console.error('[cregis:webhook] rejected — signature verification failed')
      return NextResponse.json({ error: 'invalid signature' }, { status: 401 })
    }
  } catch (error) {
    if (error instanceof MissingConfigError) {
      console.error(
        `[cregis:webhook] REJECTED — ${error.message} No payment can be processed until real ` +
          `Cregis credentials are set. This callback was NOT actioned.`,
      )
      return NextResponse.json({ error: 'payment integration not configured' }, { status: 503 })
    }
    throw error
  }

  // Cregis nests the order under `data`; reading it off the envelope matches nothing.
  const { status, orderId, cregisOrderId } = unwrapCallbackOrder(payload)

  if (!orderId) {
    return NextResponse.json({ error: 'missing order_id' }, { status: 400 })
  }

  const order = await db.checkoutOrder.findFirst({
    where: { OR: [{ id: orderId }, { cregisOrderId }] },
  })

  if (!order) {
    console.error(`[cregis:webhook] no matching order for order_id=${orderId}`)
    return NextResponse.json({ error: 'unknown order' }, { status: 404 })
  }

  // Cregis retries callbacks; acknowledge repeats without issuing a second code.
  if (order.status === 'paid') {
    return ack()
  }

  if (!isPaidStatus(status)) {
    await db.checkoutOrder.update({
      where: { id: order.id },
      data: {
        // OrderStatus has no `underpaid` member and adding one is a migration, so a
        // partial payment is recorded as `failed`. The full payload is preserved in
        // rawCallback and the log line below flags it for manual review.
        status: status === 'expired' ? 'expired' : 'failed',
        rawCallback: payload as never,
      },
    })

    if (isUnderpaid(status)) {
      console.error(
        `[cregis:webhook] UNDERPAID order ${order.id} (${order.email}) — no code issued, needs manual review`,
      )
    }
    return ack()
  }

  // Crypto cannot auto-renew, so an existing member paying again is a manual renewal:
  // extend their period rather than minting a second code they do not need.
  const existingMember = await db.member.findUnique({ where: { email: order.email } })

  if (existingMember?.passwordHash) {
    const from =
      existingMember.subscriptionRenewsAt && existingMember.subscriptionRenewsAt > new Date()
        ? existingMember.subscriptionRenewsAt // stack onto unused time rather than truncating it
        : new Date()

    await db.$transaction(async (tx) => {
      await tx.checkoutOrder.update({
        where: { id: order.id },
        data: { status: 'paid', paidAt: new Date(), cregisOrderId, rawCallback: payload as never },
      })
      await tx.member.update({
        where: { id: existingMember.id },
        data: {
          subscriptionStatus: 'active',
          subscriptionRenewsAt: addBillingPeriod(from),
          billingProvider: 'cregis',
          renewalReminderSentAt: null,
        },
      })
    })

    console.info(`[cregis:webhook] renewal for ${order.email} — period extended`)
    return ack()
  }

  const code = generateRedemptionCode()

  await db.$transaction(async (tx) => {
    await tx.checkoutOrder.update({
      where: { id: order.id },
      data: {
        status: 'paid',
        paidAt: new Date(),
        cregisOrderId,
        rawCallback: payload as never,
      },
    })

    await tx.redemptionCode.create({
      // Expiry starts from payment, not from delivery: the buyer has the code the moment
      // the callback lands, and dating it from anything later would be a promise the
      // system cannot keep if an email is slow.
      data: {
        code,
        cregisOrderId,
        email: order.email,
        status: 'unused',
        // Bought at list price, so no discount to record.
        discountPercent: 0,
        expiresAt: codeExpiresAt(),
      },
    })

    // Create the CRM contact now, at 'pending' — the subscription only becomes active
    // when the code is actually redeemed, but the contact and its source exist from the
    // moment money changes hands.
    await tx.member.upsert({
      where: { email: order.email },
      create: {
        email: order.email,
        phoneNumber: order.phoneNumber,
        source: 'cregis_checkout',
        subscriptionStatus: 'pending',
      },
      update: {
        phoneNumber: order.phoneNumber ?? undefined,
      },
    })
  })

  const redeemUrl = `${appBaseUrl()}/redeem?code=${encodeURIComponent(code)}`
  const provider = getNotificationProvider()

  // Credit the affiliate, if this buyer came through one. Never throws — see the note in
  // referral-attribution.ts: the payment is real whatever bookkeeping does.
  await recordReferralConversion(order.email, Math.round(Number(order.amount) || 0))

  // Delivery failures must not fail the webhook: the payment is real and the code is
  // issued. Cregis retrying would only mint a duplicate. Log loudly and let the admin
  // resend from the console.
  try {
    const result = await provider.sendRedemptionCodeEmail({ email: order.email }, code, redeemUrl)
    if (result.status === 'failed') {
      console.error(`[cregis:webhook] code ${code} issued but email failed: ${result.error}`)
    }
  } catch (error) {
    console.error(`[cregis:webhook] code ${code} issued but email threw`, error)
  }

  return ack()
}
