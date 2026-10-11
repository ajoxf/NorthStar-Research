import 'server-only'

import { Prisma } from '@prisma/client'

import { db } from '@/lib/db'
import { fulfilPaidOrder, type FulfilmentResult } from '@/lib/fulfilment'
import type { GatewayEvent, PaymentGateway } from '@/lib/payments/gateway-types'

/**
 * Apply what a provider told us, once.
 *
 * The one path for every confirmation that is not Stripe's or Cregis's own: provider
 * webhooks, the buyer's return page asking the provider directly, and the test provider's
 * simulate button. Each event is first recorded in PaymentEvent, whose unique (gateway,
 * eventId) means a retry, a duplicate or a race finds it there and stops. Fulfilment
 * itself claims the order atomically too (fulfilment.ts), so even two different events for
 * one payment grant once and send one receipt.
 *
 * Returns false when something failed and the provider should send it again; the event's
 * record is removed so that retry is processed rather than skipped.
 */
export async function applyGatewayEvents(gateway: PaymentGateway, events: GatewayEvent[]): Promise<boolean> {
  for (const original of events) {
    const event = await resolveOrderNumber(gateway.id, original)
    if (!event) continue
    const orderId = 'orderId' in event ? event.orderId : null

    try {
      await db.paymentEvent.create({
        data: {
          gateway: gateway.id,
          eventId: event.eventId,
          orderId,
          type: event.type,
          payload: (event.raw ?? null) as Prisma.InputJsonValue,
        },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue // already applied
      throw error
    }

    try {
      await applyOne(gateway, event)
      await db.paymentEvent.update({
        where: { gateway_eventId: { gateway: gateway.id, eventId: event.eventId } },
        data: { processedAt: new Date() },
      })
    } catch (error) {
      console.error(`[payments:${gateway.id}] could not apply ${event.type} ${event.eventId}`, error)
      await db.paymentEvent.deleteMany({ where: { gateway: gateway.id, eventId: event.eventId } })
      return false
    }
  }
  return true
}

/** "#1042" — an order number, as a payment-link provider knows it — becomes the order id. */
async function resolveOrderNumber(gatewayId: string, event: GatewayEvent): Promise<GatewayEvent | null> {
  if (!('orderId' in event) || !event.orderId.startsWith('#')) return event
  const number = Number(event.orderId.slice(1))
  const order = Number.isSafeInteger(number) ? await db.checkoutOrder.findFirst({ where: { number }, select: { id: true } }) : null
  if (!order) {
    console.error(`[payments:${gatewayId}] no order numbered ${event.orderId}`)
    return null
  }
  return { ...event, orderId: order.id }
}

async function applyOne(gateway: PaymentGateway, event: GatewayEvent): Promise<void> {
  if (event.type === 'ignored') return

  if (event.type === 'payment.succeeded') {
    const order = await db.checkoutOrder.findUnique({ where: { id: event.orderId } })
    if (!order) {
      console.error(`[payments:${gateway.id}] payment for unknown order ${event.orderId}`)
      return
    }
    // A provider can only confirm its own orders: a Ziina webhook does not pay a Stripe order.
    if (order.gateway !== gateway.id) {
      console.error(`[payments:${gateway.id}] ignored a payment for order ${order.id}, placed with ${order.gateway ?? order.provider}`)
      return
    }
    await confirmOrder(order, { methodLabel: gateway.name, raw: event.raw })
    return
  }

  if (event.type === 'payment.failed') {
    // Only a pending order fails: a late "failed" after a success changes nothing.
    await db.checkoutOrder.updateMany({ where: { id: event.orderId, gateway: gateway.id, status: 'pending' }, data: { status: 'failed' } })
    return
  }

  // A refund made in the provider's own dashboard. No provider here sends these yet; when
  // one does, it is recorded through recordRefund like a refund an admin records.
  console.error(
    `[payments:${gateway.id}] refund ${event.refundId} of ${event.amountMinor} on order ${event.orderId} — record it on Earnings → Record refund`,
  )
}

/**
 * Grant a paid order, through the same fulfilment as every rail. The receipt is sent by
 * fulfilment, once, to whichever confirmation got there first.
 */
export async function confirmOrder(
  order: Prisma.CheckoutOrderGetPayload<object>,
  input: { methodLabel: string; raw: unknown },
): Promise<FulfilmentResult> {
  if (order.status === 'paid') return { outcome: 'already' }
  return fulfilPaidOrder({
    order,
    // One period per payment, renewed by hand — every provider except Stripe's subscriptions.
    provider: order.provider === 'cregis' ? 'cregis' : 'gateway',
    // The reference the order already carries; the provider's own is kept in the raw callback.
    providerRef: order.cregisOrderId,
    methodLabel: input.methodLabel,
    amount: order.amount,
    currency: order.currency,
    rawCallback: input.raw,
  })
}
