import { NextResponse } from 'next/server'
import { z } from 'zod'

import { adminInput } from '@/app/api/admin/_admin-route'
import { requireAdmin } from '@/lib/auth'
import { decideProfileDraft } from '@/lib/expert-profile'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  decision: z.enum(['approve', 'reject']),
  reason: z.string().trim().max(500).optional(),
})

/** Approve an expert's proposed profile changes onto the live profile, or send them back with a reason. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const input = await adminInput(request, schema)
  if ('response' in input) return input.response
  const admin = await requireAdmin()

  const result = await decideProfileDraft(params.id, input.data.decision, admin.id, input.data.reason ?? null)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
