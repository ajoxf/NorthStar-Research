import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { recordAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { normaliseCountry } from '@/lib/payments/routing-shape'
import { validateTaxRow } from '@/lib/tax-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  countryCode: z.string().max(4),
  name: z.string().max(200),
  label: z.string().max(40).optional(),
  ratePercent: z.number(),
  pricesIncludeTax: z.boolean(),
  reverseCharge: z.boolean(),
  isActive: z.boolean(),
})

/** Add a country. Its rate applies to new orders only; every order keeps the rate it was sold at. */
export async function POST(request: Request) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response
  const admin = await requireAdmin()

  const code = normaliseCountry(input.data.countryCode)
  if (!code) return NextResponse.json({ error: 'The country code must be two letters, like AE.' }, { status: 400 })
  const checked = validateTaxRow(input.data)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })

  const existing = await db.taxRate.findUnique({ where: { countryCode: code } })
  if (existing) return NextResponse.json({ error: `${code} is already in the list — change it there.` }, { status: 409 })

  await db.taxRate.create({ data: { countryCode: code, ...checked.value } })
  await recordAudit(admin.id, 'tax.added', code, { new: checked.value })
  return NextResponse.json({ ok: true })
}
