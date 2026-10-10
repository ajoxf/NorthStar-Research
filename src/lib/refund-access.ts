import 'server-only'

import type { Prisma } from '@prisma/client'

import { db } from '@/lib/db'
import { linesForOrder, type FulfilmentLine } from '@/lib/fulfilment-shape'
import type { BillingIntervalValue } from '@/lib/package-shape'
import { intervalForPackage } from '@/lib/packages'
import { getPaymentProvider } from '@/lib/payments'
import { rollBackAccess } from '@/lib/refund-access-shape'

export type AccessOutcome = {
  /** Rows (entitlements, or the membership) whose paid period was taken back. */
  ended: number
  /** What happened to the card subscription, when the order had one. */
  renewal: 'cancelled' | 'removed' | 'nothing' | 'failed' | 'none'
  /** Said to the operator when something needs doing by hand. */
  note?: string
}

/**
 * Take back the access a refund paid back.
 *
 * Called when a refund completes one or more parts of an order — the lines of the experts
 * named, or `null` for house lines. Each line's paid period comes off its access (see
 * rollBackAccess): a first purchase ends today, a refunded renewal leaves the time paid
 * for before it. Rows are found by the order line that bought them, and, for rows written
 * before lines were linked, by the member and the section or package.
 *
 * A card subscription is then stopped for what was refunded — the items removed, or the
 * subscription cancelled if nothing else is on it — and the refunded rows are unlinked
 * from it, so a later invoice cannot quietly renew them. If Stripe cannot be reached the
 * access is still taken back, and the note says to cancel in Stripe by hand.
 */
export async function endRefundedAccess(
  orderId: string,
  completedAuthors: (string | null)[],
  wholeOrderDone: boolean,
  now: Date = new Date(),
): Promise<AccessOutcome> {
  const order = await db.checkoutOrder.findUnique({
    where: { id: orderId },
    select: {
      email: true,
      provider: true,
      sectionId: true,
      packageId: true,
      stripeSubscriptionId: true,
      lines: {
        orderBy: { position: 'asc' },
        select: { id: true, kind: true, sectionId: true, packageId: true, interval: true, authorId: true },
      },
    },
  })
  if (!order) return { ended: 0, renewal: 'none' }

  // An order from before lines existed is one part; whatever completed, it is that part.
  const targets: FulfilmentLine[] =
    order.lines.length > 0
      ? order.lines.filter((line) => completedAuthors.includes(line.authorId))
      : linesForOrder({ sectionId: order.sectionId, packageId: order.packageId, lines: [] })
  if (targets.length === 0) return { ended: 0, renewal: 'none' }

  const member = await db.member.findUnique({ where: { email: order.email } })
  const subscriptionId = order.stripeSubscriptionId
  let ended = 0

  if (member) {
    for (const line of targets) {
      ended += await rollBackLine(member, line, subscriptionId, now)
    }
  }

  // The card subscription, when this order started one.
  if (order.provider !== 'stripe' || !subscriptionId) return { ended, renewal: 'none' }
  const stop = getPaymentProvider('stripe').stopRenewal
  if (!stop) return { ended, renewal: 'none' }

  const productIds = wholeOrderDone ? 'all' : await productsFor(targets)
  if (productIds !== 'all' && productIds.length === 0) {
    return {
      ended,
      renewal: 'failed',
      note: 'Access was taken back, but the card subscription could not be matched to what was refunded. Cancel it in Stripe.',
    }
  }
  try {
    return { ended, renewal: await stop(subscriptionId, productIds) }
  } catch (error) {
    console.error(`[refund] could not stop subscription ${subscriptionId}`, error)
    return {
      ended,
      renewal: 'failed',
      note: 'Access was taken back, but Stripe could not be reached to stop the subscription. Cancel it in Stripe.',
    }
  }
}

async function rollBackLine(
  member: { id: string; packageId: string | null; subscriptionRenewsAt: Date | null; stripeSubscriptionId: string | null },
  line: FulfilmentLine,
  subscriptionId: string | null,
  now: Date,
): Promise<number> {
  // Unlink from the subscription only if this row was on it — another subscription's row
  // is not this refund's business.
  const unlink = (current: string | null) => (subscriptionId && current === subscriptionId ? { stripeSubscriptionId: null } : {})

  if (line.kind === 'section' && line.sectionId) {
    const section = await db.section.findUnique({ where: { id: line.sectionId }, select: { interval: true } })
    const interval = line.interval ?? section?.interval ?? 'month'
    const rows = await rowsFor(line.id, { memberId: member.id, sectionId: line.sectionId })
    return rollBackRows(rows, interval, unlink, now)
  }

  const packageId = line.kind === 'package' ? line.packageId : member.packageId
  const interval: BillingIntervalValue = line.interval ?? (await intervalForPackage(packageId ?? null))
  const itemIds = packageId
    ? (await db.packageItem.findMany({ where: { packageId }, select: { itemId: true } })).map((row) => row.itemId)
    : []

  if (itemIds.length > 0) {
    const rows = await rowsFor(line.id, { memberId: member.id, itemId: { in: itemIds } })
    return rollBackRows(rows, interval, unlink, now)
  }

  // The plan, or a package with no contents: the member's own membership.
  const result = rollBackAccess(member.subscriptionRenewsAt, interval, now)
  if (!result) return 0
  await db.member.update({
    where: { id: member.id },
    data: {
      subscriptionStatus: result.status,
      subscriptionRenewsAt: result.renewsAt,
      ...(result.status === 'expired' ? { cancelAtPeriodEnd: false } : {}),
      ...unlink(member.stripeSubscriptionId),
    },
  })
  return 1
}

/**
 * The rows a line paid for: those linked to it, or — for access granted before rows were
 * linked to lines, which includes a one-item order redeemed by code — the member's rows
 * for the same section or package items.
 */
async function rowsFor(lineId: string | null, fallback: Prisma.EntitlementWhereInput) {
  if (lineId) {
    const linked = await db.entitlement.findMany({ where: { orderLineId: lineId } })
    if (linked.length > 0) return linked
  }
  return db.entitlement.findMany({ where: fallback })
}

async function rollBackRows(
  rows: { id: string; renewsAt: Date | null; stripeSubscriptionId: string | null }[],
  interval: BillingIntervalValue,
  unlink: (current: string | null) => { stripeSubscriptionId?: null },
  now: Date,
): Promise<number> {
  let ended = 0
  for (const row of rows) {
    const result = rollBackAccess(row.renewsAt, interval, now)
    if (!result) continue
    await db.entitlement.update({
      where: { id: row.id },
      data: { status: result.status, renewsAt: result.renewsAt, ...unlink(row.stripeSubscriptionId) },
    })
    ended += 1
  }
  return ended
}

/** The Stripe products the refunded lines were sold under. */
async function productsFor(lines: FulfilmentLine[]): Promise<string[]> {
  const ids: string[] = []
  for (const line of lines) {
    if (line.sectionId) {
      const row = await db.section.findUnique({ where: { id: line.sectionId }, select: { stripeProductId: true } })
      if (row?.stripeProductId) ids.push(row.stripeProductId)
    } else if (line.packageId) {
      const row = await db.package.findUnique({ where: { id: line.packageId }, select: { stripeProductId: true } })
      if (row?.stripeProductId) ids.push(row.stripeProductId)
    }
  }
  return ids
}
