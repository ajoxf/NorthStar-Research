import { NextResponse } from 'next/server'
import { z } from 'zod'

import { optionalEmailSchema } from '@/lib/validation'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { CARRIED_NOTE, syncAffiliateOffer } from '@/lib/affiliate-commission'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: optionalEmailSchema,
  status: z.enum(['active', 'paused', 'closed']).optional(),
  rewardKind: z.enum(['percent', 'fixed', 'free_months']).optional(),
  rewardAmount: z.number().int().min(0).max(10_000).optional(),
  visitorDiscountPercent: z.number().int().min(0).max(100).nullable().optional(),
  commissionOn: z.enum(['first_payment', 'every_payment']).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  /** The master partner earning an override on this affiliate's sales; null for none. */
  parentAffiliateId: z.string().min(1).nullable().optional(),
  /** The master's override, % of the sale before tax. Null means the default. */
  overridePercent: z.number().int().min(0).max(50).nullable().optional(),
  /** Mark an award paid. Settlement happens outside this system — see below. */
  settleAwardId: z.string().optional(),
  /** Add an award by hand: a bonus, a correction, a deal struck off-ledger. */
  grantAmount: z.number().int().min(1).max(100_000).optional(),
  grantReason: z.string().trim().max(200).optional(),
})

/**
 * Update an affiliate, settle an award, or grant one.
 *
 * **The slug is not editable.** It is printed in places the affiliate cannot revise, so
 * changing it silently breaks links that are already out in the world. A partner who
 * needs a different link gets a second affiliate record.
 *
 * **Settling records a payment; it does not make one.** There is no payout processing
 * here by design — the operator pays however they already pay people, then marks the
 * award settled so the ledger matches reality.
 *
 * Nothing is ever deleted. An affiliate who stops promoting is paused or closed and
 * keeps their history.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the details you entered.' },
      { status: 400 },
    )
  }

  const affiliate = await db.affiliate.findUnique({ where: { id: params.id } })
  if (!affiliate) return NextResponse.json({ error: 'Affiliate not found.' }, { status: 404 })

  const data = parsed.data

  if (data.settleAwardId) {
    // A carried-over award is on the ledger; settling it here as well would pay it twice.
    const onLedger = await db.ledgerEntry.findFirst({
      where: { affiliateId: affiliate.id, note: `${CARRIED_NOTE}${data.settleAwardId}` },
      select: { id: true },
    })
    if (onLedger) {
      return NextResponse.json(
        { error: 'That award is on the ledger now — pay it through a withdrawal.' },
        { status: 409 },
      )
    }
    // Scoped to this affiliate: an id from one partner's page must not settle another's.
    const updated = await db.affiliateAward.updateMany({
      where: { id: data.settleAwardId, affiliateId: affiliate.id, settledAt: null },
      data: { settledAt: new Date() },
    })
    if (updated.count === 0) {
      return NextResponse.json(
        { error: 'That award is already settled, or does not belong to this affiliate.' },
        { status: 409 },
      )
    }
    return NextResponse.json({ ok: true })
  }

  if (data.grantAmount) {
    await db.affiliateAward.create({
      data: {
        affiliateId: affiliate.id,
        kind: affiliate.rewardKind,
        amount: data.grantAmount,
        reason: data.grantReason || 'Manual award',
      },
    })
    return NextResponse.json({ ok: true })
  }

  // One level of partners: a master cannot itself sit under a master, and an affiliate who
  // has sub-affiliates of their own cannot be put under one.
  if (data.parentAffiliateId) {
    if (data.parentAffiliateId === affiliate.id) {
      return NextResponse.json({ error: 'An affiliate cannot be their own master partner.' }, { status: 400 })
    }
    const master = await db.affiliate.findUnique({ where: { id: data.parentAffiliateId }, select: { parentAffiliateId: true } })
    if (!master) return NextResponse.json({ error: 'That master partner does not exist.' }, { status: 400 })
    if (master.parentAffiliateId) {
      return NextResponse.json({ error: 'That partner is a sub-affiliate themselves; masters go one level deep.' }, { status: 400 })
    }
    const subs = await db.affiliate.count({ where: { parentAffiliateId: affiliate.id } })
    if (subs > 0) {
      return NextResponse.json({ error: 'This affiliate has sub-affiliates of their own, so cannot be put under a master.' }, { status: 400 })
    }
  }

  const updated = await db.affiliate.update({
    where: { id: affiliate.id },
    data: {
      name: data.name ?? undefined,
      email: data.email?.toLowerCase() ?? undefined,
      status: data.status ?? undefined,
      rewardKind: data.rewardKind ?? undefined,
      rewardAmount: data.rewardAmount ?? undefined,
      visitorDiscountPercent:
        data.visitorDiscountPercent === undefined ? undefined : data.visitorDiscountPercent,
      commissionOn: data.commissionOn ?? undefined,
      notes: data.notes === undefined ? undefined : data.notes,
      parentAffiliateId: data.parentAffiliateId === undefined ? undefined : data.parentAffiliateId,
      overridePercent: data.overridePercent === undefined ? undefined : data.overridePercent,
    },
  })

  await syncAffiliateOffer(updated)
  return NextResponse.json({ ok: true })
}
