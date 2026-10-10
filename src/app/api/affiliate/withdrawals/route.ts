import { NextResponse } from 'next/server'
import { z } from 'zod'

import { affiliateForMember } from '@/lib/affiliate-account'
import { getCurrentMember } from '@/lib/auth'
import { requestPayout } from '@/lib/payouts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  amountCents: z.number().int().positive('Enter an amount greater than zero.'),
  destination: z.string().trim().min(1, 'Say where the money should go.').max(200),
  note: z.string().trim().max(500).optional(),
})

/**
 * An affiliate asks for their own available commission.
 *
 * Lands in the same queue as an expert's withdrawal: nothing moves until an operator
 * approves it and then records it sent. The affiliate is the one linked to the signed-in
 * member — never named in the body, so nobody can ask for somebody else's money.
 */
export async function POST(request: Request) {
  const member = await getCurrentMember()
  if (!member) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  const affiliate = await affiliateForMember(member.id)
  if (!affiliate) return NextResponse.json({ error: 'This account is not an affiliate.' }, { status: 403 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the details you entered.' },
      { status: 400 },
    )
  }

  const result = await requestPayout({
    affiliateId: affiliate.id,
    amountCents: parsed.data.amountCents,
    destination: parsed.data.destination,
    note: parsed.data.note || null,
    requestedByMemberId: member.id,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 })
  return NextResponse.json({ ok: true, payoutId: result.payoutId })
}
