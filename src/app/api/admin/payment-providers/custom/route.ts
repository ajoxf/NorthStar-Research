import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { recordAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { customIdFor, validateCustom } from '@/lib/payments/custom-shape'
import { builtInGateways } from '@/lib/payments/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  name: z.string().max(200),
  label: z.string().max(200).optional(),
  payUrl: z.string().max(2000).optional(),
  instructions: z.string().max(4000).optional(),
  currencies: z.string().max(200).optional(),
})

/** Add a payment-link provider, no code. It is offered to nobody until a rule names it. */
export async function POST(request: Request) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response
  const admin = await requireAdmin()

  const checked = validateCustom(input.data)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })

  const taken = [
    ...builtInGateways().map((gateway) => gateway.id),
    ...(await db.customGateway.findMany({ select: { id: true } })).map((row) => row.id),
  ]
  const id = customIdFor(checked.value.name, taken)
  await db.customGateway.create({ data: { id, ...checked.value } })
  await recordAudit(admin.id, 'gateway.custom.added', id, { name: checked.value.name })
  return NextResponse.json({ ok: true, id, name: checked.value.name })
}
