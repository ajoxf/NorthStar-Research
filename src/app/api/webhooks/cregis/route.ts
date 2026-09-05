import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { appBaseUrl, MissingConfigError } from '@/lib/env'
import { addPeriod } from '@/lib/package-shape'
import { intervalForPackage } from '@/lib/packages'
import { verifyCregisCallback } from '@/lib/cregis'
import { callbackIpAllowed, clientAddress } from '@/lib/cregis-callback'
import { resolveCregisSettings } from '@/lib/cregis-settings'
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

  /*
   * Optional source-address allowlist, checked before the signature.
   *
   * Off unless an operator sets it, and that default is correct rather than lax: the
   * signature below is what actually authorises the callback, and Cregis has historically
   * called from a rotating pool of addresses. An incomplete allowlist would silently
   * reject real payments — the worst failure this system has — so it is opt-in, and the
   * console says as much beside the field.
   */
  try {
    const { callbackIps } = await resolveCregisSettings()
    const source = clientAddress(request.headers)
    if (!callbackIpAllowed(callbackIps.value, source)) {
      console.error(`[cregis:webhook] rejected — source ${source ?? 'unknown'} is not allowlisted`)
      return NextResponse.json({ error: 'source not allowed' }, { status: 403 })
    }
  } catch (error) {
    // A settings lookup failure must not silently open the gate, but it also must not
    // reject a real payment: the signature check below still stands on its own.
    console.error('[cregis:webhook] could not read the IP allowlist; continuing on signature', error)
  }

  try {
    if (!(await verifyCregisCallback(payload))) {
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

  /*
   * An operator's configuration probe. Record the outcome and stop.
   *
   * This return is the whole safety of the test-payment feature: everything below grants
   * access — a redemption code, a member row, a welcome email, affiliate credit — and
   * none of it should happen because somebody checked that the plumbing works. Placed
   * before the paid/unpaid branch so a failed test is recorded just as faithfully as a
   * successful one; a probe that only reports its successes is not a probe.
   */
  if (order.isTest) {
    const paid = isPaidStatus(status)
    await db.checkoutOrder.update({
      where: { id: order.id },
      data: {
        status: paid ? 'paid' : status === 'expired' ? 'expired' : 'failed',
        paidAt: paid ? new Date() : null,
        cregisOrderId,
        rawCallback: payload as never,
      },
    })
    console.info(
      `[cregis:webhook] TEST order ${order.id} → ${status}. Callback verified; nothing granted.`,
    )
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
    /*
     * Which thing is being renewed?
     *
     * An order carrying a section renews that section. Extending the member's own period
     * instead would quietly upgrade a single-section subscriber to the whole archive —
     * the same trap the Stripe renewal path has, arriving by crypto.
     */
    const renewingSection = order.sectionId
      ? await db.section.findUnique({
          where: { id: order.sectionId },
          select: { id: true, interval: true },
        })
      : null

    const interval = renewingSection
      ? renewingSection.interval
      : await intervalForPackage(order.packageId ?? existingMember.packageId)

    const held = renewingSection
      ? await db.entitlement.findUnique({
          where: {
            memberId_sectionId: { memberId: existingMember.id, sectionId: renewingSection.id },
          },
          select: { renewsAt: true },
        })
      : null

    // Stack onto unused time rather than truncating it, whichever is being renewed.
    const current = renewingSection ? (held?.renewsAt ?? null) : existingMember.subscriptionRenewsAt
    const from = current && current > new Date() ? current : new Date()

    await db.$transaction(async (tx) => {
      await tx.checkoutOrder.update({
        where: { id: order.id },
        data: { status: 'paid', paidAt: new Date(), cregisOrderId, rawCallback: payload as never },
      })

      if (renewingSection) {
        await tx.entitlement.upsert({
          where: {
            memberId_sectionId: { memberId: existingMember.id, sectionId: renewingSection.id },
          },
          create: {
            memberId: existingMember.id,
            sectionId: renewingSection.id,
            status: 'active',
            startedAt: new Date(),
            renewsAt: addPeriod(interval, from),
            billingProvider: 'cregis',
          },
          update: {
            status: 'active',
            renewsAt: addPeriod(interval, from),
            cancelAtPeriodEnd: false,
          },
        })
        return
      }

      await tx.member.update({
        where: { id: existingMember.id },
        data: {
          subscriptionStatus: 'active',
          subscriptionRenewsAt: addPeriod(interval, from),
          billingProvider: 'cregis',
          packageId: order.packageId ?? existingMember.packageId,
          renewalReminderSentAt: null,
        },
      })
    })

    /*
     * A renewal is a payment, and a payment gets a receipt.
     *
     * This was missing: a returning member paid, their period was silently extended, and
     * they received nothing at all. No receipt, no confirmation — the only evidence
     * anything happened was a renewal date they would have to log in to see. It presents
     * exactly like a failed payment, and it is the same person paying again who is most
     * entitled to know it worked.
     *
     * No access code here, correctly: they already have an account, and a code would be
     * an activation step they do not need and cannot use.
     */
    try {
      const receipt = await getNotificationProvider().sendReceiptEmail(
        { email: order.email, firstName: existingMember.firstName },
        {
          amount: order.amount,
          currency: order.currency,
          method: 'Crypto',
          reference: cregisOrderId,
          paidAt: new Date(),
        },
      )
      if (receipt.status === 'failed') {
        console.error(`[cregis:webhook] renewal receipt failed for ${order.email}: ${receipt.error}`)
      }
    } catch (error) {
      // Same rule as everywhere else on this path: the money is real and the period is
      // extended whatever the mail does.
      console.error('[cregis:webhook] renewal receipt threw', error)
    }

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
        // Carried from the order so the buyer is granted the package they paid for,
        // whatever the default has become by the time they redeem.
        packageId: order.packageId,
        // Likewise the section, when a single section was what was bought. Null keeps its
        // old meaning: this code grants the all-access membership.
        sectionId: order.sectionId,
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
        // packageId describes the all-access plan, so a section purchase leaves it alone.
        packageId: order.sectionId ? null : order.packageId,
      },
      update: {
        phoneNumber: order.phoneNumber ?? undefined,
        ...(order.sectionId ? {} : { packageId: order.packageId ?? undefined }),
      },
    })
  })

  const redeemUrl = `${appBaseUrl()}/redeem?code=${encodeURIComponent(code)}`
  const provider = getNotificationProvider()

  // A receipt for a payment that actually happened. Sent here rather than at redemption
  // because this is the only place the amount and the processor's reference are known.
  try {
    const receipt = await provider.sendReceiptEmail(
      { email: order.email },
      {
        amount: order.amount,
        currency: order.currency,
        method: 'Crypto',
        reference: cregisOrderId,
        paidAt: new Date(),
      },
    )
    if (receipt.status === 'failed') {
      console.error(`[cregis:webhook] receipt failed for ${order.email}: ${receipt.error}`)
    }
  } catch (error) {
    console.error('[cregis:webhook] receipt threw', error)
  }

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
