import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { requireAdmin } from '@/lib/auth'
import { recordRefund } from '@/lib/ledger'
import { refundThroughProvider } from '@/lib/payments/provider-refund'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  orderId: z.string().min(1),
  amountCents: z.number().int().positive('Enter a refund amount greater than zero.'),
  /** One expert's part of the order. Absent refunds the order as a whole. */
  authorId: z.string().min(1).optional(),
  reason: z.string().trim().max(500).optional(),
  /** Send the money back through the order's provider first, where it can. */
  throughProvider: z.boolean().optional(),
})

/**
 * Write down a refund that has already happened.
 *
 * Without `throughProvider` **this refunds nobody**: an operator issues the refund in
 * Stripe or sends the crypto back, then records it here so the ledger takes the shares
 * back. With it, for an order paid through a provider that can refund (Razorpay, Tap,
 * PayPal), the money is sent back through that provider first and recorded only once it
 * has gone — see provider-refund.ts.
 */
export async function POST(request: Request) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response

  const admin = await requireAdmin()

  if (input.data.throughProvider) {
    const sent = await refundThroughProvider({
      orderId: input.data.orderId,
      amountCents: input.data.amountCents,
      authorId: input.data.authorId ?? null,
      reason: input.data.reason || null,
      adminId: admin.id,
    })
    if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status })
    return NextResponse.json({ ok: true, refundId: sent.refundId, recorded: sent.recorded })
  }

  const result = await recordRefund({
    orderId: input.data.orderId,
    amountCents: input.data.amountCents,
    authorId: input.data.authorId ?? null,
    reason: input.data.reason || null,
    recordedByMemberId: admin.id,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, reversedCents: result.reversedCents, access: result.access })
}
