import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { requireAdmin } from '@/lib/auth'
import { sendBackSubmission } from '@/lib/expert-reports'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ reason: z.string().trim().min(1, 'Say why, so they can fix it.').max(500) })

/**
 * Send an expert's submission back with a reason. Approving has no route of its own:
 * publishing the report is the approval (see /publish).
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response
  const admin = await requireAdmin()

  const result = await sendBackSubmission(params.id, admin.id, input.data.reason)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
