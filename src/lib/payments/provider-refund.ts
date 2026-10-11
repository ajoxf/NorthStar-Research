import 'server-only'

import { Prisma } from '@prisma/client'

import { db } from '@/lib/db'
import { recordRefund } from '@/lib/ledger'
import { sessionIdOf } from '@/lib/payments/session-ref'
import { ProviderError } from '@/lib/payments/http'
import { connectForConfirmation } from '@/lib/payments/registry'

/** The PaymentEvent that claims a provider refund, so it is recorded once however it arrives. */
export function refundEventId(refundId: string): string {
  return `refund:${refundId}`
}

/**
 * Claim a provider refund for recording. True for whoever gets there first — the admin's
 * own request, or the provider's notification of it — and false for the other.
 */
export async function claimProviderRefund(gatewayId: string, refundId: string, orderId: string): Promise<boolean> {
  try {
    await db.paymentEvent.create({
      data: { gateway: gatewayId, eventId: refundEventId(refundId), orderId, type: 'refund.succeeded' },
    })
    return true
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false
    throw error
  }
}

export type ProviderRefundResult =
  | { ok: true; refundId: string; recorded: 'now' | 'already' }
  | { ok: false; error: string; status: number }

/**
 * Send a refund through the provider the order was paid with, then record it.
 *
 * The money moves first and is recorded second, never the reverse: a recorded refund that
 * the provider then refused would tell the ledger money went back that never did. If the
 * provider says no, nothing is recorded and its own error is shown.
 */
export async function refundThroughProvider(input: {
  orderId: string
  amountCents: number
  authorId: string | null
  reason: string | null
  adminId: string
}): Promise<ProviderRefundResult> {
  const order = await db.checkoutOrder.findUnique({
    where: { id: input.orderId },
    include: { refunds: { select: { amountCents: true } } },
  })
  if (!order) return { ok: false, error: 'No such order.', status: 404 }
  if (order.status !== 'paid') return { ok: false, error: 'Only a paid order can be refunded.', status: 409 }
  if (!order.gateway) return { ok: false, error: 'This order was not paid through a provider that refunds from here.', status: 409 }

  const connected = await connectForConfirmation(order.gateway)
  if (!connected?.gateway.refund) {
    return { ok: false, error: `${connected?.gateway.name ?? 'That provider'} cannot refund from here. Refund it there, then record it.`, status: 409 }
  }

  // The same ceiling recordRefund applies, checked before any money moves.
  const gross = order.grossCents ?? Math.round(Number(order.amount) * 100)
  const refunded = order.refunds.reduce((sum, refund) => sum + refund.amountCents, 0)
  if (input.amountCents > gross - refunded) {
    return { ok: false, error: `At most ${((gross - refunded) / 100).toFixed(2)} ${order.currency} is left to refund.`, status: 400 }
  }

  let refundId: string
  try {
    const result = await connected.gateway.refund(
      { orderId: order.id, sessionId: sessionIdOf(order.gateway, order.cregisOrderId), amountMinor: input.amountCents, currency: order.currency },
      connected.cfg,
    )
    refundId = result.refundId
  } catch (error) {
    const message = error instanceof ProviderError || error instanceof Error ? error.message : 'The provider refused the refund.'
    return { ok: false, error: message.slice(0, 300), status: 502 }
  }

  // The provider's notification may already have recorded it.
  if (!(await claimProviderRefund(connected.gateway.id, refundId, order.id))) return { ok: true, refundId, recorded: 'already' }

  const recorded = await recordRefund({
    orderId: order.id,
    amountCents: input.amountCents,
    authorId: input.authorId,
    reason: input.reason,
    recordedByMemberId: input.adminId,
    providerRefundId: refundId,
  })
  if (!recorded.ok) {
    // Money has gone back; let the provider's notification try to record it again.
    await db.paymentEvent.deleteMany({ where: { gateway: connected.gateway.id, eventId: refundEventId(refundId) } })
    console.error(`[refund] ${connected.gateway.id} refunded ${refundId} on ${order.id} but it was not recorded: ${recorded.error}`)
    return { ok: false, error: `Refunded at ${connected.gateway.name} (${refundId}), but not recorded here: ${recorded.error}`, status: 500 }
  }
  return { ok: true, refundId, recorded: 'now' }
}
