import { NextResponse } from 'next/server'

import { adminOnly } from '@/app/api/admin/_admin-route'
import { runConnectionTest } from '@/lib/payments/admin-actions'
import { resolveGateway, withConfigs } from '@/lib/payments/registry'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Test a provider's keys as they are now — saved or from the environment. Changes nothing. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const refused = await adminOnly()
  if (refused) return refused
  const gateway = await resolveGateway(params.id)
  if (!gateway) return NextResponse.json({ error: 'No such provider.' }, { status: 404 })
  const [connected] = await withConfigs([gateway])
  return NextResponse.json(await runConnectionTest(connected))
}
