import { NextResponse } from 'next/server'
import { z } from 'zod'

import { buyerCountry } from '@/lib/buyer-country'
import { gatewaysFor } from '@/lib/payments/registry'
import { normaliseCurrency } from '@/lib/payments/routing-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ currency: z.string().trim().max(3), country: z.string().trim().max(2).optional() })

/**
 * The ways a buyer may pay, best first, for their billing country and the currency they
 * are charged in. Names and button text only: nothing about keys or configuration.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  const currency = parsed.success ? normaliseCurrency(parsed.data.currency) : undefined
  if (!parsed.success || !currency) return NextResponse.json({ error: 'Unknown currency.' }, { status: 400 })

  const country = buyerCountry(parsed.data.country)
  const gateways = await gatewaysFor(country, currency)
  return NextResponse.json({
    country,
    methods: gateways.map((gateway) => ({
      id: gateway.id,
      label: gateway.label,
      recurring: Boolean(gateway.recurring),
    })),
  })
}
