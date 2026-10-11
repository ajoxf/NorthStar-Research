import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { recordAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { validateTaxRow } from '@/lib/tax-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  name: z.string().max(200),
  label: z.string().max(40).optional(),
  ratePercent: z.number(),
  pricesIncludeTax: z.boolean(),
  reverseCharge: z.boolean(),
  isActive: z.boolean(),
})

/**
 * Change a country's tax. New orders use it from now on; orders already made keep the rate
 * they were sold at, and so do their invoices. The audit log keeps the old and new values.
 */
export async function PATCH(request: Request, { params }: { params: { code: string } }) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response
  const admin = await requireAdmin()

  const code = params.code.toUpperCase()
  const existing = await db.taxRate.findUnique({ where: { countryCode: code } })
  if (!existing) return NextResponse.json({ error: 'No such country.' }, { status: 404 })
  const checked = validateTaxRow(input.data)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })

  await db.taxRate.update({ where: { countryCode: code }, data: checked.value })
  await recordAudit(admin.id, 'tax.changed', code, {
    old: {
      name: existing.name,
      label: existing.label,
      rate: Number(existing.rate),
      pricesIncludeTax: existing.pricesIncludeTax,
      reverseCharge: existing.reverseCharge,
      isActive: existing.isActive,
    },
    new: checked.value,
  })
  return NextResponse.json({ ok: true })
}
