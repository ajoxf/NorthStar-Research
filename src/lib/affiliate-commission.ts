import 'server-only'

import type { CheckoutOrder, Prisma } from '@prisma/client'

import { commissionCents, commissionClawback, earnsCommission } from '@/lib/commission-shape'
import { db } from '@/lib/db'
import { DEFAULT_HOLDBACK_DAYS, payableAt } from '@/lib/earnings'
import type { OfferShape } from '@/lib/offer'
import { affiliateOffer } from '@/lib/offers'
import { referralSlugFromCookie } from '@/lib/referral-attribution'

type Tx = Prisma.TransactionClient

/**
 * The affiliate a checkout arrived through, and the discount their link carries.
 *
 * Read from the referral cookie the link set (last click wins, for 30 days). Only an active
 * affiliate attributes: a paused one keeps its link working but earns nothing new, and a
 * closed one is gone. Recorded on the order at checkout, so commission no longer depends on
 * matching an email after the fact — which is what used to miss a new buyer's first payment.
 */
export async function affiliateForCheckout(): Promise<{ affiliateId: string; offer: OfferShape | null } | null> {
  const slug = referralSlugFromCookie()
  if (!slug) return null
  const affiliate = await db.affiliate.findUnique({ where: { slug }, select: { id: true, status: true } })
  if (!affiliate || affiliate.status !== 'active') return null
  return { affiliateId: affiliate.id, offer: await affiliateOffer(affiliate.id) }
}

/**
 * Keep an affiliate's visitor discount backed by a real offer.
 *
 * A real Offer row, rather than a figure read off the affiliate at checkout, so the discount
 * is priced, recorded, counted and turned into a Stripe coupon by exactly the same code as
 * every other discount. It covers everything and applies to the first payment. Changing the
 * percentage archives the old offer and creates a new one, because a Stripe coupon cannot
 * be edited and buyers already carrying the old one keep it. Clearing it archives it.
 */
export async function syncAffiliateOffer(affiliate: { id: string; name: string; visitorDiscountPercent: number | null }) {
  const current = await db.offer.findFirst({ where: { affiliateId: affiliate.id, archivedAt: null } })
  const wanted = affiliate.visitorDiscountPercent && affiliate.visitorDiscountPercent > 0 ? affiliate.visitorDiscountPercent : null
  if (current && current.percentOff === wanted) return
  if (current) await db.offer.update({ where: { id: current.id }, data: { archivedAt: new Date() } })
  if (wanted) {
    await db.offer.create({
      data: {
        // Buyers see this name; it does not say who referred them.
        name: 'Referral discount',
        percentOff: wanted,
        duration: 'first_payment',
        appliesToEverything: true,
        affiliateId: affiliate.id,
      },
    })
  }
}

/** What a paid order owes an affiliate, worked out before the payment's transaction. */
export type CommissionPlan = {
  affiliateId: string
  paidCents: number
  /** Cash commission in cents; zero for a free-months reward. */
  cents: number
  sharePercent: number | null
  /** A free-months reward to record for an operator to grant, on a buyer's first order. */
  freeMonths: number | null
}

/**
 * Work out the commission a paid order owes, reading only.
 *
 * Done before the payment's transaction, and never throws: a payment must not fail because
 * attribution did (see referral-attribution.ts). If anything here goes wrong the order is
 * paid and granted without commission, and the error is logged for an operator to credit
 * by hand.
 *
 * The affiliate is the one recorded at checkout. An order placed before that was recorded
 * falls back to the old rule — the buyer's open referral, matched by email.
 */
export async function planCommission(order: CheckoutOrder): Promise<CommissionPlan | null> {
  try {
    const affiliateId = order.affiliateId ?? (await legacyAffiliateFor(order.email))
    if (!affiliateId) return null
    const affiliate = await db.affiliate.findUnique({ where: { id: affiliateId } })
    if (!affiliate || affiliate.status !== 'active') return null

    const paidCents = order.grossCents ?? Math.round(Number(order.amount) * 100)
    // First-payment terms pay once per buyer. Every payment that earned anything — cash or
    // free months — converted this buyer's referral, so a converted one means paid before.
    const earlier = await db.referral.count({ where: { affiliateId, email: order.email, status: 'converted' } })
    if (!earnsCommission(affiliate.commissionOn, earlier)) return null

    return {
      affiliateId,
      paidCents,
      cents: commissionCents(affiliate, paidCents),
      sharePercent: affiliate.rewardKind === 'percent' ? affiliate.rewardAmount : null,
      freeMonths: affiliate.rewardKind === 'free_months' && earlier === 0 ? affiliate.rewardAmount : null,
    }
  } catch (error) {
    console.error(`[affiliate] could not work out commission for order ${order.id}; credit it by hand`, error)
    return null
  }
}

/**
 * Write a planned commission, inside the transaction that marks the order paid.
 *
 * Inside, so the commission and `ibFeeCents` land with the payment or not at all: the
 * experts' share is worked out net of `ibFeeCents`, and a commission written a moment after
 * an expert's earning would have paid the experts on the gross. Only plain inserts and one
 * update happen here; everything that could fail for an interesting reason ran in
 * planCommission.
 */
export async function applyCommission(tx: Tx, plan: CommissionPlan, order: CheckoutOrder, paidAt: Date): Promise<number> {
  await recordFunnel(tx, plan.affiliateId, order.email, plan.paidCents)

  if (plan.freeMonths) {
    // Not cash: recorded for an operator to grant, as before.
    await tx.affiliateAward.create({
      data: { affiliateId: plan.affiliateId, kind: 'free_months', amount: plan.freeMonths, reason: `Order ${order.id}` },
    })
  }
  if (plan.cents <= 0) {
    await tx.checkoutOrder.update({ where: { id: order.id }, data: { affiliateId: plan.affiliateId } })
    return 0
  }

  await tx.ledgerEntry.create({
    data: {
      affiliateId: plan.affiliateId,
      kind: 'commission',
      amountCents: plan.cents,
      currency: order.currency,
      // Held like an expert's earning, so a refund lands on the ledger before anybody is paid.
      payableAt: payableAt(paidAt, DEFAULT_HOLDBACK_DAYS),
      orderId: order.id,
      sharePercent: plan.sharePercent,
      basisCents: plan.paidCents,
    },
  })
  await tx.checkoutOrder.update({
    where: { id: order.id },
    data: { affiliateId: plan.affiliateId, ibFeeCents: plan.cents },
  })
  return plan.cents
}

/**
 * Take back an affiliate's commission in proportion to a refund — all of it on a full one.
 * Written beside the experts' reversals, in the refund's own transaction.
 */
export async function clawBackCommission(
  tx: Tx,
  input: {
    orderId: string
    refundId: string
    grossCents: number
    refundedAfterCents: number
    currency: string
    reason: string | null
    recordedByMemberId: string | null
  },
): Promise<number> {
  const commissions = await tx.ledgerEntry.findMany({
    where: { orderId: input.orderId, kind: 'commission', affiliateId: { not: null } },
    select: { affiliateId: true, amountCents: true },
  })
  let total = 0
  for (const commission of commissions) {
    const affiliateId = commission.affiliateId as string
    const reversed = await tx.ledgerEntry.aggregate({
      where: { affiliateId, kind: 'reversal', refund: { orderId: input.orderId } },
      _sum: { amountCents: true },
    })
    const take = commissionClawback({
      commissionCents: commission.amountCents,
      grossCents: input.grossCents,
      refundedAfterCents: input.refundedAfterCents,
      reversedSoFarCents: -(reversed._sum.amountCents ?? 0),
    })
    if (take <= 0) continue
    await tx.ledgerEntry.create({
      data: {
        affiliateId,
        kind: 'reversal',
        amountCents: -take,
        currency: input.currency,
        payableAt: null,
        refundId: input.refundId,
        note: input.reason,
        createdByMemberId: input.recordedByMemberId,
      },
    })
    total -= take
  }
  return total
}

/** The affiliate behind an older order: the buyer's most recent open referral, by email. */
async function legacyAffiliateFor(email: string): Promise<string | null> {
  const referral = await db.referral.findFirst({
    where: { email, status: { in: ['visited', 'signed_up'] } },
    orderBy: { visitedAt: 'desc' },
    select: { affiliateId: true },
  })
  return referral?.affiliateId ?? null
}

/**
 * Keep the affiliate's funnel counts true: this buyer converted. Updates their referral if
 * one carries their email, otherwise records the conversion. Never names the buyer to the
 * affiliate — the portal shows counts only.
 */
async function recordFunnel(tx: Tx, affiliateId: string, email: string, paidCents: number) {
  const existing = await tx.referral.findFirst({
    where: { affiliateId, email },
    orderBy: { visitedAt: 'desc' },
    select: { id: true, status: true },
  })
  const data = { status: 'converted' as const, convertedAt: new Date(), amountUsd: Math.round(paidCents / 100) }
  if (existing) {
    if (existing.status !== 'converted') await tx.referral.update({ where: { id: existing.id }, data })
    return
  }
  await tx.referral.create({ data: { affiliateId, email, signedUpAt: new Date(), ...data } })
}

/** The note on a carried-over award's ledger row, followed by the award's id. */
export const CARRIED_NOTE = 'Carried over from award '

/**
 * Move commission that was owed before the ledger existed onto it, once.
 *
 * Unsettled cash awards from the old whole-dollar list become commission rows, available at
 * once — they are older than any holdback. Settled awards stay where they are, as history.
 * Free-months awards are not cash and are not moved. Each award is carried once: the row it
 * becomes names it, and an award already named is skipped.
 */
export async function carryOverAwards(affiliateId: string): Promise<number> {
  const awards = await db.affiliateAward.findMany({
    where: { affiliateId, settledAt: null, kind: { in: ['percent', 'fixed'] }, amount: { gt: 0 } },
    select: { id: true, amount: true, createdAt: true },
  })
  let carried = 0
  for (const award of awards) {
    const note = `${CARRIED_NOTE}${award.id}`
    const already = await db.ledgerEntry.findFirst({ where: { affiliateId, note }, select: { id: true } })
    if (already) continue
    await db.ledgerEntry.create({
      data: {
        affiliateId,
        kind: 'commission',
        amountCents: award.amount * 100,
        currency: 'USD',
        payableAt: null,
        note,
        createdAt: award.createdAt,
      },
    })
    carried += 1
  }
  return carried
}
