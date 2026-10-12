import { NextResponse } from 'next/server'
import { z } from 'zod'

import { authorForMember } from '@/lib/expert-account'
import { getCurrentMember } from '@/lib/auth'
import { savePayoutDetails } from '@/lib/payout-details'
import { PAYOUT_METHODS } from '@/lib/payout-details-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  method: z.enum(PAYOUT_METHODS),
  holderName: z.string().max(200),
  account: z.string().max(200),
  routing: z.string().max(100).optional(),
  bankName: z.string().max(200).optional(),
})

/**
 * An expert saves where their withdrawals should go.
 *
 * The record is the one linked to the signed-in member, never one named in the body. The
 * account owner is emailed on every change; see savePayoutDetails.
 */
export async function PUT(request: Request) {
  const member = await getCurrentMember()
  if (!member) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  const author = await authorForMember(member.id)
  if (!author) return NextResponse.json({ error: 'This account is not an expert.' }, { status: 403 })
  const party = { authorId: author.id }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Check the details you entered.' }, { status: 400 })

  const result = await savePayoutDetails(party, parsed.data, member)
  if (!result.ok) return NextResponse.json({ error: result.error, field: result.field }, { status: result.status })
  return NextResponse.json({ ok: true, summary: result.summary, alerted: result.alerted })
}
