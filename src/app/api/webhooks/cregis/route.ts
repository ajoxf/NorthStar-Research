import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { addBillingPeriod, appBaseUrl, MissingConfigError } from '@/lib/env'
import { verifyCregisCallback } from '@/lib/cregis'
import { generateRedemptionCode } from '@/lib/codes'
import { getNotificationProvider } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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

  const status = String(payload.status ?? payload.order_status ?? '').toLowerCase()
  const orderId = String(payload.order_id ?? '')
  const cregisOrderId = String(payload.cregis_id ?? payload.trade_id ?? orderId)

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
    return NextResponse.json({ ok: true, note: 'already processed' })
  }

  const isPaid = ['paid', 'success', 'succeeded', 'completed', 'confirmed'].includes(status)

  if (!isPaid) {
    await db.checkoutOrder.update({
      where: { id: order.id },
      data: {
        status: status === 'expired' ? 'expired' : 'failed',
        rawCallback: payload as never,
      },
    })
    return NextResponse.json({ ok: true })
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
    return NextResponse.json({ ok: true, renewal: true })
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
      data: { code, cregisOrderId, email: order.email, status: 'unused' },
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

  if (order.phoneNumber) {
    try {
      await provider.sendRedemptionCodeWhatsApp({ phoneNumber: order.phoneNumber }, code, redeemUrl)
    } catch (error) {
      console.error('[cregis:webhook] WhatsApp code delivery threw', error)
    }
  }

  return NextResponse.json({ ok: true })
}
