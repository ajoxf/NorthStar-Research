import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { ForbiddenError, requireAdmin } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  subscriptionStatus: z.enum(['pending', 'active', 'expired', 'cancelled']).optional(),
  tags: z.array(z.string().trim().max(40)).max(25).optional(),
  adminNotes: z.string().max(5000).nullable().optional(),
})

/** Update the CRM fields on a member: status, segmentation tags, and free-form notes. */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the values you entered.' },
      { status: 400 },
    )
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.adminNotes !== undefined) data.adminNotes = parsed.data.adminNotes || null
  if (parsed.data.tags !== undefined) {
    data.tags = Array.from(new Set(parsed.data.tags.map((tag) => tag.trim()).filter(Boolean)))
  }

  if (parsed.data.subscriptionStatus !== undefined) {
    data.subscriptionStatus = parsed.data.subscriptionStatus
    // Activating from the console (e.g. comping a member, or fixing a failed webhook)
    // needs to set the start date, or the account shows as active since never.
    if (parsed.data.subscriptionStatus === 'active') {
      const existing = await db.member.findUnique({
        where: { id: params.id },
        select: { subscriptionStartedAt: true },
      })
      if (!existing?.subscriptionStartedAt) data.subscriptionStartedAt = new Date()
    }
  }

  const member = await db.member.update({ where: { id: params.id }, data })
  return NextResponse.json({ ok: true, memberId: member.id })
}
