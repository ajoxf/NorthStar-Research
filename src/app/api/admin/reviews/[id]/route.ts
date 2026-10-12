import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { decideReview } from '@/lib/reviews'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ decision: z.enum(['approve', 'reject']) })

/** Approve or reject a review. Admin only. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  let admin
  try {
    admin = await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 })
    throw error
  }
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Approve or reject.' }, { status: 400 })
  const result = await decideReview(params.id, parsed.data.decision, admin.id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
