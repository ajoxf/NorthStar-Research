import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { fulfilPaidOrder } from '@/lib/fulfilment'
import { cregisProvider } from '@/lib/payments/cregis-provider'
import { isPaidStatus, isUnderpaid, unwrapCallbackOrder } from '@/lib/cregis-protocol'

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
  // JSON, then the optional source allowlist, then the signature — see cregis-provider.ts.
  const verified = await cregisProvider.verifyWebhook(await request.text(), request.headers)
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: verified.status })
  }
  const payload = verified.event

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

  /*
   * Paid. Grant it — or, for somebody without an account, issue a code — in the one place
   * that does this for every rail. Crypto cannot auto-renew, so an existing member paying
   * again is a manual renewal, and fulfilment stacks the new period on the time they hold.
   */
  const result = await fulfilPaidOrder({
    order,
    provider: 'cregis',
    providerRef: cregisOrderId,
    methodLabel: 'Crypto',
    amount: order.amount,
    currency: order.currency,
    rawCallback: payload,
  })
  if (result.outcome === 'granted') console.info(`[cregis:webhook] ${order.email} — period extended`)

  return ack()
}
