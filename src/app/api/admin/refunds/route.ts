import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { requireAdmin } from '@/lib/auth'
import { recordRefund } from '@/lib/ledger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  orderId: z.string().min(1),
  amountCents: z.number().int().positive('Enter a refund amount greater than zero.'),
  reason: z.string().trim().max(500).optional(),
})

/**
 * Write down a refund that has already happened.
 *
 * **This refunds nobody.** Neither processor is refunded through this app: an operator
 * issues it in Stripe or sends the crypto back, then records it here so the ledger knows
 * to take the contributor's share back. A button that claimed to move money it never
 * touched would be worse than no button.
 */
export async function POST(request: Request) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response

  const admin = await requireAdmin()

  const result = await recordRefund({
    orderId: input.data.orderId,
    amountCents: input.data.amountCents,
    reason: input.data.reason || null,
    recordedByMemberId: admin.id,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, reversedCents: result.reversedCents })
}
