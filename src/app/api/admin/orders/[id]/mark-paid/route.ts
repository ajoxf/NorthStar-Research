import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { recordAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { confirmOrder } from '@/lib/payments/apply'
import { resolveGateway } from '@/lib/payments/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ reference: z.string().trim().max(200).optional() })

/**
 * Confirm a payment by hand, once the money has arrived — a bank transfer, a payment link.
 *
 * The same fulfilment as a provider's webhook: access is granted, or a code issued, and one
 * receipt is sent — however many times this is pressed, or if the webhook lands as well.
 * Recorded in the audit log with the reference the admin typed.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response
  const admin = await requireAdmin()

  const order = await db.checkoutOrder.findUnique({ where: { id: params.id } })
  if (!order) return NextResponse.json({ error: 'No such order.' }, { status: 404 })
  if (order.status === 'paid') return NextResponse.json({ error: 'That order is already paid.' }, { status: 409 })
  if (order.status !== 'pending' && order.status !== 'failed') {
    return NextResponse.json({ error: `A ${order.status} order cannot be marked as paid.` }, { status: 409 })
  }
  if (!(Number(order.amount) > 0)) return NextResponse.json({ error: 'There is nothing to pay on this order.' }, { status: 409 })
  if (order.isTest) return NextResponse.json({ error: 'A test order grants nothing.' }, { status: 409 })

  const reference = input.data.reference || null
  const gateway = order.gateway ? await resolveGateway(order.gateway) : undefined
  const result = await confirmOrder(order, {
    methodLabel: gateway?.name ?? (order.provider === 'cregis' ? 'Crypto' : 'Payment'),
    raw: { markedPaidBy: admin.id, reference },
  })
  if (result.outcome !== 'already') {
    await recordAudit(admin.id, 'order.marked_paid', order.id, { reference, amount: order.amount, currency: order.currency })
  }
  return NextResponse.json({ ok: true, outcome: result.outcome })
}
