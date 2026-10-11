import { NextResponse } from 'next/server'

import { applyGatewayEvents } from '@/lib/payments/apply'
import { connectForConfirmation } from '@/lib/payments/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * One webhook endpoint per provider from the Providers page: /api/webhooks/payments/{id}.
 *
 * The provider verifies its own request — a signature, or by fetching the object back from
 * its API with our keys — before anything is read from it. Stripe and Cregis have their own
 * routes and are not served here.
 *
 * A paused provider still confirms: pausing stops new checkouts, not payments already made.
 * Answers 500 when applying failed, so the provider sends it again.
 */
export async function POST(request: Request, { params }: { params: { gateway: string } }) {
  const connected = await connectForConfirmation(params.gateway)
  if (!connected || connected.gateway.rail || !connected.gateway.parseWebhook) {
    return NextResponse.json({ error: 'unknown provider' }, { status: 404 })
  }
  const { gateway, cfg } = connected

  let events
  try {
    events = await gateway.parseWebhook!(request, cfg)
  } catch (error) {
    console.error(`[payments:${gateway.id}] webhook refused: ${error instanceof Error ? error.message : 'invalid'}`)
    return NextResponse.json({ error: 'invalid webhook' }, { status: 400 })
  }

  if (!(await applyGatewayEvents(gateway, events))) {
    return NextResponse.json({ error: 'not applied, retry' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
