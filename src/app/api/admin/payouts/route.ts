import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { requireAdmin } from '@/lib/auth'
import { requestPayout } from '@/lib/payouts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  authorId: z.string().min(1),
  amountCents: z.number().int().positive('Enter an amount greater than zero.'),
  destination: z.string().trim().max(200).optional(),
  note: z.string().trim().max(500).optional(),
})

/**
 * Ask for a withdrawal of a contributor's balance.
 *
 * Creating one moves no money and needs no approval — approving it does. Keeping the two
 * apart is the entire control, so this endpoint deliberately cannot send anything.
 */
export async function POST(request: Request) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response

  // Re-read rather than trusted from the body: who asked is half the audit trail, and a
  // client that could name the requester could name somebody else.
  const admin = await requireAdmin()

  const result = await requestPayout({
    authorId: input.data.authorId,
    amountCents: input.data.amountCents,
    destination: input.data.destination || null,
    note: input.data.note || null,
    requestedByMemberId: admin.id,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 })
  }
  return NextResponse.json({ ok: true, payoutId: result.payoutId })
}
