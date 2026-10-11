import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentMember } from '@/lib/auth'
import { authorForMember } from '@/lib/expert-account'
import { requestPayout } from '@/lib/payouts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  amountCents: z.number().int().positive('Enter an amount greater than zero.'),
  destination: z.string().trim().min(1, 'Say where the money should go.').max(200),
  note: z.string().trim().max(500).optional(),
})

/**
 * An expert asks for their own available earnings.
 *
 * The same queue as a withdrawal the desk raises for them: nothing moves until an operator
 * approves it and records it sent. The expert is the one linked to the signed-in member —
 * never named in the body, so nobody can ask for somebody else's money.
 */
export async function POST(request: Request) {
  const member = await getCurrentMember()
  if (!member) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  const author = await authorForMember(member.id)
  if (!author) return NextResponse.json({ error: 'This account is not an expert.' }, { status: 403 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the details you entered.' },
      { status: 400 },
    )
  }

  const result = await requestPayout({
    authorId: author.id,
    amountCents: parsed.data.amountCents,
    destination: parsed.data.destination,
    note: parsed.data.note || null,
    requestedByMemberId: member.id,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 400 })
  return NextResponse.json({ ok: true, payoutId: result.payoutId })
}
