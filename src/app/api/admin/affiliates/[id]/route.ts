import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().email().optional(),
  status: z.enum(['active', 'paused', 'closed']).optional(),
  rewardKind: z.enum(['percent', 'fixed', 'free_months']).optional(),
  rewardAmount: z.number().int().min(0).max(10_000).optional(),
  visitorDiscountPercent: z.number().int().min(0).max(100).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
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

  await db.affiliate.update({
    where: { id: affiliate.id },
    data: {
      name: data.name ?? undefined,
      email: data.email?.toLowerCase() ?? undefined,
      status: data.status ?? undefined,
      rewardKind: data.rewardKind ?? undefined,
      rewardAmount: data.rewardAmount ?? undefined,
      visitorDiscountPercent:
        data.visitorDiscountPercent === undefined ? undefined : data.visitorDiscountPercent,
      notes: data.notes === undefined ? undefined : data.notes,
    },
  })

  return NextResponse.json({ ok: true })
}
