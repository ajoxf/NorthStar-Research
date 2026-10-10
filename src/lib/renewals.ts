import 'server-only'

import { applyCommission, planCommission } from '@/lib/affiliate-commission'
import { db } from '@/lib/db'
import { apportion } from '@/lib/earnings'
import { amountString } from '@/lib/package-shape'

/**
 * Record a card renewal as a paid order.
 *
 * Stripe renews a subscription by itself and tells us with `invoice.paid`. That used to
 * extend access and nothing else — no order — so the money taken on every renewal after
 * the first was invisible to everything that reads orders: experts were never paid their
 * share of it, an affiliate on every-payment terms could never be credited, and the
 * payments list stopped at the first month. Crypto renewals never had this gap, because
 * each crypto payment is a checkout of its own.
 *
 * The renewal order copies the lines of the order that started the subscription, with
 * what was actually charged shared across them by their original prices — a discount that
 * ran out after the first month is reflected in the total Stripe charged. Access is not
 * touched here: the webhook has already moved it. No receipt either: the webhook sends it.
 *
 * Idempotent on the invoice id, which is unique as the order's reference: a retried
 * webhook finds the order already recorded and stops.
 */
export async function recordCardRenewal(invoice: {
  id: string
  subscriptionId: string
  amountPaidCents: number
  currency: string
}): Promise<'recorded' | 'already' | 'no-original'> {
  const existing = await db.checkoutOrder.findUnique({ where: { cregisOrderId: invoice.id }, select: { id: true } })
  if (existing) return 'already'

  const original = await db.checkoutOrder.findFirst({
    where: { stripeSubscriptionId: invoice.subscriptionId, provider: 'stripe', isTest: false },
    orderBy: { createdAt: 'asc' },
    include: { lines: { orderBy: { position: 'asc' } } },
  })
  if (!original) return 'no-original'

  const shares = apportion(
    invoice.amountPaidCents,
    original.lines.map((line) => line.listCents),
  )

  const now = new Date()
  let order
  try {
    order = await db.checkoutOrder.create({
      data: {
        cregisOrderId: invoice.id,
        provider: 'stripe',
        email: original.email,
        amount: amountString(invoice.amountPaidCents),
        grossCents: invoice.amountPaidCents,
        currency: invoice.currency.toUpperCase(),
        status: 'paid',
        paidAt: now,
        stripeSubscriptionId: invoice.subscriptionId,
        sectionId: original.sectionId,
        packageId: original.packageId,
        affiliateId: original.affiliateId,
        lines: {
          create: original.lines.map((line, index) => ({
            position: line.position,
            kind: line.kind,
            sectionId: line.sectionId,
            packageId: line.packageId,
            name: line.name,
            interval: line.interval,
            listCents: line.listCents,
            chargeCents: shares[index] ?? 0,
            offerId: null,
            authorId: line.authorId,
          })),
        },
      },
    })
  } catch (error) {
    // Another delivery of the same invoice got here first.
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Unique constraint')) return 'already'
    throw error
  }

  // Commission on a renewal, for an affiliate on every-payment terms. First-payment terms
  // find the buyer's earlier commissioned order and credit nothing.
  const commission = await planCommission(order)
  if (commission) {
    await db.$transaction((tx) => applyCommission(tx, commission, order, now))
  }
  return 'recorded'
}
