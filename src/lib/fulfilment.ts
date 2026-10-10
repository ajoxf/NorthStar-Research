import 'server-only'

import type { BillingProvider, CheckoutOrder, Prisma } from '@prisma/client'

import { codeExpiresAt, generateRedemptionCode } from '@/lib/codes'
import { db } from '@/lib/db'
import { appBaseUrl } from '@/lib/env'
import {
  fulfilmentRoute,
  latestEnd,
  linesForOrder,
  periodStart,
  type FulfilmentLine,
} from '@/lib/fulfilment-shape'
import { getNotificationProvider } from '@/lib/notifications'
import { addPeriod, type BillingIntervalValue } from '@/lib/package-shape'
import { intervalForPackage } from '@/lib/packages'
import { recordReferralConversion } from '@/lib/referral-attribution'

type Tx = Prisma.TransactionClient

/**
 * Turning a paid order into access — the one place it happens, whichever rail took the
 * money.
 *
 * This used to be written twice, once inside each webhook, and the two had drifted: a card
 * buyer who already had an account was issued a code they could not redeem, while the
 * same buyer paying in crypto was granted at once. Both rails now verify their own
 * callback and hand the order here.
 *
 * Grants are per line. An order line names a section, a package or the built-in plan; an
 * order placed before lines existed is read as one line (see linesForOrder).
 */
export async function fulfilPaidOrder(input: {
  order: CheckoutOrder
  provider: Extract<BillingProvider, 'stripe' | 'cregis'>
  /** The rail's reference for this payment; written onto the order. */
  providerRef: string
  /** How the receipt names the method: "Card", "Crypto". */
  methodLabel: string
  /** What was actually paid, for the receipt and the affiliate. */
  amount: string
  currency: string
  rawCallback: unknown
  /** Card only: the customer and subscription Stripe created for this checkout. */
  stripe?: { customerId: string | null; subscriptionId: string | null }
}): Promise<{ outcome: 'granted' } | { outcome: 'code'; code: string }> {
  const { order, provider } = input
  const subscriptionId = input.stripe?.subscriptionId ?? null
  const now = new Date()

  const stored = await db.orderLine.findMany({
    where: { orderId: order.id },
    orderBy: { position: 'asc' },
    select: { id: true, kind: true, sectionId: true, packageId: true, interval: true },
  })
  const lines = linesForOrder({ sectionId: order.sectionId, packageId: order.packageId, lines: stored })

  const member = await db.member.findUnique({ where: { email: order.email } })
  const paidUpdate = {
    status: 'paid' as const,
    paidAt: now,
    cregisOrderId: input.providerRef,
    rawCallback: input.rawCallback as never,
    ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
  }

  let result: { outcome: 'granted' } | { outcome: 'code'; code: string }

  if (member && fulfilmentRoute({ hasPassword: Boolean(member.passwordHash) }) === 'grant') {
    await db.$transaction(async (tx) => {
      await tx.checkoutOrder.update({ where: { id: order.id }, data: paidUpdate })
      for (const line of lines) {
        await grantLine(tx, member, line, { provider, subscriptionId, now })
      }
      // So the card subscription's invoices can find this member. Only when they have
      // none: a customer id is unique, and an older one still routes its own invoices.
      if (input.stripe?.customerId && !member.stripeCustomerId) {
        await tx.member.update({
          where: { id: member.id },
          data: { stripeCustomerId: input.stripe.customerId },
        })
      }
    })
    result = { outcome: 'granted' }
  } else {
    const code = generateRedemptionCode()
    // What the member's own all-access columns describe: only a plan line, never a section
    // or a package with contents — those are entitlements, granted at redemption.
    const single = lines.length === 1 ? lines[0] : null
    const allAccess = single !== null && single.kind !== 'section'

    await db.$transaction(async (tx) => {
      await tx.checkoutOrder.update({ where: { id: order.id }, data: paidUpdate })
      await tx.redemptionCode.create({
        // Expiry runs from payment: the buyer has the code the moment the callback lands.
        data: {
          code,
          orderId: order.id,
          cregisOrderId: input.providerRef,
          email: order.email,
          status: 'unused',
          discountPercent: 0,
          expiresAt: codeExpiresAt(),
          // A one-line order also names its item on the code, which is what redemption
          // reads today. A code for several lines is redeemed from the order's lines.
          packageId: single?.packageId ?? null,
          sectionId: single?.sectionId ?? null,
        },
      })
      // The CRM contact, at 'pending' until the code is redeemed.
      await tx.member.upsert({
        where: { email: order.email },
        create: {
          email: order.email,
          phoneNumber: order.phoneNumber,
          source: provider === 'stripe' ? 'stripe_checkout' : 'cregis_checkout',
          subscriptionStatus: 'pending',
          ...(provider === 'stripe' ? { billingProvider: 'stripe' as const } : {}),
          stripeCustomerId: input.stripe?.customerId ?? null,
          stripeSubscriptionId: allAccess ? subscriptionId : null,
          packageId: allAccess ? (single?.packageId ?? null) : null,
        },
        update: {
          phoneNumber: order.phoneNumber ?? undefined,
          ...(provider === 'stripe' ? { billingProvider: 'stripe' as const } : {}),
          stripeCustomerId: input.stripe?.customerId ?? undefined,
          ...(allAccess
            ? { stripeSubscriptionId: subscriptionId ?? undefined, packageId: single?.packageId ?? undefined }
            : {}),
        },
      })
    })
    result = { outcome: 'code', code }
  }

  await afterPayment(input, member?.firstName ?? null, result)
  return result
}

/**
 * Grant one line to a member who already has an account, stacked on any time they hold.
 *
 * - **A section** is one entitlement.
 * - **A package with contents** is one entitlement per item, all moved to the same date —
 *   the latest any of them already ran to — so paying early never shortens one part of a
 *   bundle to match another. Missing rows are created, not skipped.
 * - **The built-in plan, or a package nobody has put anything in,** is the all-access
 *   membership on the member's own columns, the same rule `grantFor` applies at
 *   redemption.
 */
async function grantLine(
  tx: Tx,
  member: { id: string; packageId: string | null; subscriptionRenewsAt: Date | null; subscriptionStartedAt: Date | null },
  line: FulfilmentLine,
  opts: { provider: BillingProvider; subscriptionId: string | null; now: Date },
) {
  const link = {
    billingProvider: opts.provider,
    ...(line.id ? { orderLineId: line.id } : {}),
    ...(opts.subscriptionId ? { stripeSubscriptionId: opts.subscriptionId } : {}),
  }

  if (line.kind === 'section' && line.sectionId) {
    const section = await tx.section.findUnique({
      where: { id: line.sectionId },
      select: { id: true, interval: true, itemId: true },
    })
    if (!section) return
    const interval = line.interval ?? section.interval
    const held = await tx.entitlement.findUnique({
      where: { memberId_sectionId: { memberId: member.id, sectionId: section.id } },
      select: { renewsAt: true },
    })
    const renewsAt = addPeriod(interval, periodStart(opts.now, held?.renewsAt))
    await tx.entitlement.upsert({
      where: { memberId_sectionId: { memberId: member.id, sectionId: section.id } },
      create: {
        memberId: member.id,
        sectionId: section.id,
        itemId: section.itemId,
        status: 'active',
        startedAt: opts.now,
        renewsAt,
        ...link,
      },
      update: { status: 'active', renewsAt, cancelAtPeriodEnd: false, ...link },
    })
    return
  }

  // A plan line renews whatever package the member's membership is on, as it always has.
  const packageId = line.kind === 'package' ? line.packageId : member.packageId
  const items = packageId
    ? await tx.packageItem.findMany({
        where: { packageId, item: { archivedAt: null } },
        select: { itemId: true, item: { select: { section: { select: { id: true } } } } },
      })
    : []
  const interval: BillingIntervalValue = line.interval ?? (await intervalForPackage(packageId ?? null))

  if (items.length === 0) {
    const renewsAt = addPeriod(interval, periodStart(opts.now, member.subscriptionRenewsAt))
    await tx.member.update({
      where: { id: member.id },
      data: {
        subscriptionStatus: 'active',
        subscriptionRenewsAt: renewsAt,
        subscriptionStartedAt: member.subscriptionStartedAt ?? opts.now,
        billingProvider: opts.provider,
        packageId: packageId ?? member.packageId,
        renewalReminderSentAt: null,
        ...(opts.subscriptionId ? { stripeSubscriptionId: opts.subscriptionId } : {}),
      },
    })
    return
  }

  const held = await tx.entitlement.findMany({
    where: { memberId: member.id, itemId: { in: items.map((row) => row.itemId) } },
    select: { renewsAt: true },
  })
  const renewsAt = addPeriod(interval, periodStart(opts.now, latestEnd(held.map((row) => row.renewsAt))))

  for (const { itemId, item } of items) {
    const sectionId = item.section?.id ?? null
    const existing = await tx.entitlement.findFirst({
      where: { memberId: member.id, OR: [{ itemId }, ...(sectionId ? [{ sectionId }] : [])] },
      select: { id: true },
    })
    if (existing) {
      await tx.entitlement.update({
        where: { id: existing.id },
        data: {
          status: 'active',
          renewsAt,
          cancelAtPeriodEnd: false,
          itemId,
          ...(sectionId ? { sectionId } : {}),
          ...link,
        },
      })
    } else {
      await tx.entitlement.create({
        data: { memberId: member.id, itemId, sectionId, status: 'active', startedAt: opts.now, renewsAt, ...link },
      })
    }
  }
}

/**
 * Receipt, affiliate credit and, for a new buyer, the code — after the grant has
 * committed. None of it can undo a payment, so none of it throws: the money is real and
 * the access is granted whatever the mail or the bookkeeping does.
 */
async function afterPayment(
  input: Parameters<typeof fulfilPaidOrder>[0],
  firstName: string | null,
  result: { outcome: 'granted' } | { outcome: 'code'; code: string },
) {
  const { order } = input
  const tag = `[fulfilment:${input.provider}]`
  const notifications = getNotificationProvider()

  try {
    const receipt = await notifications.sendReceiptEmail(
      { email: order.email, firstName },
      {
        amount: input.amount,
        currency: input.currency,
        method: input.methodLabel,
        reference: input.providerRef,
        paidAt: new Date(),
      },
    )
    if (receipt.status === 'failed') console.error(`${tag} receipt failed for ${order.email}: ${receipt.error}`)
  } catch (error) {
    console.error(`${tag} receipt threw`, error)
  }

  // One award per referral at most, so a renewal through here never credits twice.
  await recordReferralConversion(order.email, Math.round(Number(input.amount) || 0))

  if (result.outcome === 'code') {
    const redeemUrl = `${appBaseUrl()}/redeem?code=${encodeURIComponent(result.code)}`
    try {
      const sent = await notifications.sendRedemptionCodeEmail({ email: order.email }, result.code, redeemUrl)
      if (sent.status === 'failed') {
        console.error(`${tag} code ${result.code} issued but email failed: ${sent.error}`)
      }
    } catch (error) {
      console.error(`${tag} code ${result.code} issued but email threw`, error)
    }
  } else {
    console.info(`${tag} order ${order.id} granted directly to ${order.email}`)
  }
}
