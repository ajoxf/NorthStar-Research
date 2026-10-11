import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { applyGatewayEvents } from '@/lib/payments/apply'
import { testGateway, testPaymentsAllowed } from '@/lib/payments/gateways/test'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ orderId: z.string().trim().min(1).max(64) })

/**
 * The test provider's "Simulate payment". Only while ALLOW_TEST_PAYMENTS=true, and only for
 * an order placed with the test provider — it can never pay for anything else.
 */
export async function POST(request: Request) {
  if (!testPaymentsAllowed()) return NextResponse.json({ error: 'Test payments are off.' }, { status: 404 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Which order?' }, { status: 400 })

  const order = await db.checkoutOrder.findUnique({ where: { id: parsed.data.orderId }, select: { id: true, gateway: true } })
  if (!order || order.gateway !== testGateway.id) return NextResponse.json({ error: 'Not a test order.' }, { status: 404 })

  const ok = await applyGatewayEvents(testGateway, [
    { type: 'payment.succeeded', eventId: `simulate:${order.id}`, orderId: order.id, raw: { simulated: true } },
  ])
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'Could not confirm.' }, { status: 500 })
}
