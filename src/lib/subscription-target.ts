import 'server-only'

import { db } from '@/lib/db'
import { subscriptionTarget, type SubscriptionTarget } from '@/lib/subscription-target-shape'

export type ResolvedSubscription =
  | { kind: 'entitlements'; ids: string[] }
  | { kind: 'all_access' }
  | { kind: 'unknown'; reason: string }

/**
 * The entitlements a Stripe subscription renews, or the all-access membership, or nothing.
 *
 * Rows that should have carried the subscription id and do not — redeemed before this fix
 * — are found by section or item and linked here, once, so every later event finds them
 * directly. Only rows with no subscription id of their own are claimed: a row already tied
 * to a different subscription belongs to that one.
 */
export async function resolveSubscription(
  subscriptionId: string | null | undefined,
  member: { id: string; stripeSubscriptionId: string | null },
): Promise<ResolvedSubscription> {
  if (!subscriptionId) return { kind: 'unknown', reason: 'event carries no subscription id' }

  const [linked, order] = await Promise.all([
    db.entitlement.findMany({
      where: { stripeSubscriptionId: subscriptionId },
      select: { id: true },
    }),
    db.checkoutOrder.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      orderBy: { createdAt: 'asc' },
      select: { sectionId: true, packageId: true },
    }),
  ])

  const packageItemIds =
    order?.packageId && !order.sectionId
      ? (
          await db.packageItem.findMany({
            where: { packageId: order.packageId },
            select: { itemId: true },
          })
        ).map((row) => row.itemId)
      : []

  const target: SubscriptionTarget = subscriptionTarget({
    linkedEntitlementIds: linked.map((row) => row.id),
    order: order ? { ...order, packageItemIds } : null,
    memberSubscriptionId: member.stripeSubscriptionId,
    subscriptionId,
  })

  switch (target.kind) {
    case 'entitlements':
    case 'all_access':
      return target
    case 'unknown':
      return { kind: 'unknown', reason: 'no order or entitlement is tied to this subscription' }
    case 'section':
    case 'items': {
      const rows = await db.entitlement.findMany({
        where: {
          memberId: member.id,
          stripeSubscriptionId: null,
          ...(target.kind === 'section'
            ? { sectionId: target.sectionId }
            : { itemId: { in: target.itemIds } }),
        },
        select: { id: true },
      })
      if (rows.length === 0) {
        // Normal before the buyer redeems their code: redemption sets the first period.
        return { kind: 'unknown', reason: 'the purchase has not been redeemed yet' }
      }
      const ids = rows.map((row) => row.id)
      await db.entitlement.updateMany({
        where: { id: { in: ids } },
        data: { stripeSubscriptionId: subscriptionId, billingProvider: 'stripe' },
      })
      return { kind: 'entitlements', ids }
    }
  }
}
