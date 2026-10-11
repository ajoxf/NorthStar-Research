import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { gatewaysFor } from '@/lib/payments/registry'
import { normaliseCountry, normaliseCurrency } from '@/lib/payments/routing-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ country: z.string().max(10).optional(), currency: z.string().max(10) })

/** What a buyer in this country, paying in this currency, would be offered — exactly as checkout decides. */
export async function POST(request: Request) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response
  const country = normaliseCountry(input.data.country)
  const currency = normaliseCurrency(input.data.currency)
  if (country === undefined) return NextResponse.json({ error: 'Country must be two letters, or blank.' }, { status: 400 })
  if (!currency) return NextResponse.json({ error: 'Currency must be three letters.' }, { status: 400 })
  const offered = await gatewaysFor(country, currency)
  return NextResponse.json({ country, currency, offered: offered.map((gateway) => ({ id: gateway.id, name: gateway.name })) })
}
