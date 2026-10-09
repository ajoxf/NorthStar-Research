import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { requireAdmin } from '@/lib/auth'
import { advancePayout } from '@/lib/payouts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  to: z.enum(['approved', 'rejected', 'sent', 'settled', 'failed']),
  reason: z.string().trim().max(500).optional(),
  externalReference: z.string().trim().max(200).optional(),
})

/**
 * Move a withdrawal along.
 *
 * `requested` is not in the enum above and `sent` is — which is the point of the check
 * inside `advancePayout` rather than here. The transition table is what refuses
 * `requested → sent`, and it refuses it for this route exactly as it does for the screen,
 * because the screen is not what an API client talks to.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response

  const admin = await requireAdmin()

  const result = await advancePayout({
    payoutId: params.id,
    to: input.data.to,
    byMemberId: admin.id,
    reason: input.data.reason || null,
    externalReference: input.data.externalReference || null,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 })
  }
  return NextResponse.json({ ok: true })
}
