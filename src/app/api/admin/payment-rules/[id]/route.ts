import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput, adminOnly } from '@/app/api/admin/_admin-route'
import { recordAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ isActive: z.boolean() })

/** Pause or resume one rule. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response
  const admin = await requireAdmin()
  const updated = await db.paymentRoute.updateMany({ where: { id: params.id }, data: { isActive: input.data.isActive } })
  if (updated.count === 0) return NextResponse.json({ error: 'No such rule.' }, { status: 404 })
  await recordAudit(admin.id, input.data.isActive ? 'route.resumed' : 'route.paused', params.id)
  return NextResponse.json({ ok: true })
}

/** Delete one rule. With none left, buyers are offered card then crypto again. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const refused = await adminOnly()
  if (refused) return refused
  const admin = await requireAdmin()
  const rule = await db.paymentRoute.findUnique({ where: { id: params.id } })
  if (!rule) return NextResponse.json({ error: 'No such rule.' }, { status: 404 })
  await db.paymentRoute.delete({ where: { id: rule.id } })
  await recordAudit(admin.id, 'route.deleted', rule.id, { countryCode: rule.countryCode, currency: rule.currency, gateway: rule.gateway })
  return NextResponse.json({ ok: true })
}
