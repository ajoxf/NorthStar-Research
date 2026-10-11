import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { recordAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { resolveGateway } from '@/lib/payments/registry'
import { normaliseCountry, normaliseCurrency } from '@/lib/payments/routing-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  country: z.string().max(10).optional(),
  currency: z.string().max(10).optional(),
  gateway: z.string().min(1).max(60),
  priority: z.number().int().min(0).max(10_000).optional(),
})

/** Add a rule: buyers in this country, paying in this currency, are offered this provider. */
export async function POST(request: Request) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response
  const admin = await requireAdmin()

  const countryCode = normaliseCountry(input.data.country)
  if (countryCode === undefined) return NextResponse.json({ error: 'Country must be two letters, like AE — or blank for any.' }, { status: 400 })
  const currency = normaliseCurrency(input.data.currency)
  if (currency === undefined) return NextResponse.json({ error: 'Currency must be three letters, like USD — or blank for any.' }, { status: 400 })
  const gateway = await resolveGateway(input.data.gateway)
  if (!gateway) return NextResponse.json({ error: 'Choose a provider.' }, { status: 400 })

  const rule = await db.paymentRoute.create({
    data: { countryCode, currency, gateway: gateway.id, priority: input.data.priority ?? 100 },
  })
  await recordAudit(admin.id, 'route.added', rule.id, { countryCode, currency, gateway: gateway.id, priority: rule.priority })
  return NextResponse.json({ ok: true, id: rule.id })
}
