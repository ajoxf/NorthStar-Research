import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput, adminOnly } from '@/app/api/admin/_admin-route'
import { recordAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { CUSTOM_ID, validateCustom } from '@/lib/payments/custom-shape'
import { forgetGateway } from '@/lib/payments/gateway-settings'
import { resolveGateway } from '@/lib/payments/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  name: z.string().max(200),
  label: z.string().max(200).optional(),
  payUrl: z.string().max(2000).optional(),
  instructions: z.string().max(4000).optional(),
  currencies: z.string().max(200).optional(),
})

/** Change a payment-link provider's details. Its id — in rules and on orders — stays. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response
  const admin = await requireAdmin()
  if (!CUSTOM_ID.test(params.id)) return NextResponse.json({ error: 'No such provider.' }, { status: 404 })

  const checked = validateCustom(input.data)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })
  const updated = await db.customGateway.updateMany({ where: { id: params.id }, data: checked.value })
  if (updated.count === 0) return NextResponse.json({ error: 'No such provider.' }, { status: 404 })
  await recordAudit(admin.id, 'gateway.custom.edited', params.id, { fields: Object.keys(input.data) })
  return NextResponse.json({ ok: true })
}

/**
 * Delete a payment-link provider, with its rules and saved keys. Orders placed through it
 * keep their history: they name it by id, and show that id once it is gone.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const refused = await adminOnly()
  if (refused) return refused
  const admin = await requireAdmin()
  if (!CUSTOM_ID.test(params.id)) return NextResponse.json({ error: 'No such provider.' }, { status: 404 })

  const gateway = await resolveGateway(params.id)
  if (!gateway) return NextResponse.json({ error: 'No such provider.' }, { status: 404 })
  await db.paymentRoute.deleteMany({ where: { gateway: gateway.id } })
  await forgetGateway(gateway)
  await db.customGateway.delete({ where: { id: gateway.id } })
  await recordAudit(admin.id, 'gateway.custom.deleted', gateway.id, { name: gateway.name })
  return NextResponse.json({ ok: true })
}
