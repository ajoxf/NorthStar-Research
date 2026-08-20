import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { resolveContactNumbers } from '@/lib/contact-numbers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  subscriptionStatus: z.enum(['pending', 'active', 'expired', 'cancelled']).optional(),
  tags: z.array(z.string().trim().max(40)).max(25).optional(),
  adminNotes: z.string().max(5000).nullable().optional(),
  /*
   * Editable so the numbers missing from members who joined before the fields existed
   * can be filled in by hand, rather than being lost for the life of the account.
   */
  phoneNumber: z.string().trim().max(32).nullable().optional(),
  whatsappNumber: z.string().trim().max(32).nullable().optional(),
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

  if (parsed.data.phoneNumber !== undefined || parsed.data.whatsappNumber !== undefined) {
    const existing = await db.member.findUnique({
      where: { id: params.id },
      select: { phoneNumber: true, whatsappNumber: true },
    })
    if (!existing) return NextResponse.json({ error: 'No such member.' }, { status: 404 })

    // Whatever is not being edited keeps its current value, so saving one number never
    // silently clears the other.
    const numbers = resolveContactNumbers({
      phoneNumber:
        parsed.data.phoneNumber !== undefined ? parsed.data.phoneNumber : existing.phoneNumber,
      whatsappSameAsPhone: false,
      whatsappNumber:
        parsed.data.whatsappNumber !== undefined
          ? parsed.data.whatsappNumber
          : existing.whatsappNumber,
    })

    data.phoneNumber = numbers.phoneNumber
    data.whatsappNumber = numbers.whatsappNumber
    data.whatsappOptIn = numbers.whatsappOptIn
  }
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
