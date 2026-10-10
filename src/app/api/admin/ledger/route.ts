import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { requireAdmin } from '@/lib/auth'
import { postAdjustment } from '@/lib/payouts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  authorId: z.string().min(1),
  /** Signed. Negative takes money off a balance; positive adds it. */
  amountCents: z.number().int(),
  note: z.string().trim().min(1, 'Say what this adjustment is for.').max(500),
})

/**
 * Write a correction onto the ledger.
 *
 * The alternative is editing a row, and an append-only ledger whose rows can be edited is
 * just a table. Every real ledger needs a way to say "this was wrong" without destroying
 * what it said before — which is why this adds an entry rather than changing one.
 */
export async function POST(request: Request) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response

  const admin = await requireAdmin()

  const result = await postAdjustment({
    authorId: input.data.authorId,
    amountCents: input.data.amountCents,
    note: input.data.note,
    byMemberId: admin.id,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 })
  return NextResponse.json({ ok: true })
}
