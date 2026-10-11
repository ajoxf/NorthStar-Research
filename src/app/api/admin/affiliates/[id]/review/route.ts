import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { reviewApplication } from '@/lib/partner-application'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ decision: z.enum(['approve', 'decline']) })

/** Approve or decline a partner application. Admin only. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 })
    throw error
  }
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Approve or decline.' }, { status: 400 })

  const result = await reviewApplication(params.id, parsed.data.decision)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
