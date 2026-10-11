import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput, adminOnly } from '@/app/api/admin/_admin-route'
import { recordAudit } from '@/lib/audit'
import { requireAdmin } from '@/lib/auth'
import { runConnectionTest } from '@/lib/payments/admin-actions'
import { removeKeys, saveKeys, validateKeys } from '@/lib/payments/gateway-settings'
import { resolveGateway, withConfigs } from '@/lib/payments/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ values: z.record(z.string(), z.string().nullable()) })

/**
 * Save a provider's keys, then test them. Secrets are encrypted before they are stored and
 * never come back; a blank secret keeps the one saved. The audit log names the fields
 * changed, never their values.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response
  const admin = await requireAdmin()

  const gateway = await resolveGateway(params.id)
  if (!gateway) return NextResponse.json({ error: 'No such provider.' }, { status: 404 })

  const checked = validateKeys(gateway, input.data.values)
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 })

  const changed = await saveKeys(gateway, checked.writes, admin.id)
  if (changed.length) await recordAudit(admin.id, 'gateway.keys.saved', gateway.id, { fields: changed })

  const [connected] = await withConfigs([gateway])
  const test = await runConnectionTest(connected)
  return NextResponse.json({ ok: true, changed, test })
}

/** Remove every saved key for this provider. Environment variables, if any, take over. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const refused = await adminOnly()
  if (refused) return refused
  const admin = await requireAdmin()

  const gateway = await resolveGateway(params.id)
  if (!gateway) return NextResponse.json({ error: 'No such provider.' }, { status: 404 })
  const removed = await removeKeys(gateway)
  await recordAudit(admin.id, 'gateway.keys.removed', gateway.id, { fields: removed })
  return NextResponse.json({ ok: true, removed })
}
