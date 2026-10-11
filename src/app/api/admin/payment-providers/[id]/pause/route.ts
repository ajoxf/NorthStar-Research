import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { recordAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { setPaused } from '@/lib/payments/gateway-settings'
import { resolveGateway } from '@/lib/payments/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ paused: z.boolean() })

/**
 * Pause or resume a provider. Paused, it is offered to nobody from the next page load; it
 * still confirms payments already made, so nobody who paid is left without access.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response
  const admin = await requireAdmin()
  const gateway = await resolveGateway(params.id)
  if (!gateway) return NextResponse.json({ error: 'No such provider.' }, { status: 404 })
  await setPaused(gateway.id, input.data.paused, admin.id)
  await recordAudit(admin.id, input.data.paused ? 'gateway.paused' : 'gateway.resumed', gateway.id)
  return NextResponse.json({ ok: true })
}
