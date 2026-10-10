import { NextResponse } from 'next/server'
import { z } from 'zod'

import { inviteAffiliate } from '@/lib/affiliate-account'
import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { optionalEmailSchema } from '@/lib/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ email: optionalEmailSchema })

async function admin(): Promise<NextResponse | null> {
  try {
    await requireAdmin()
    return null
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 })
    throw error
  }
}

/**
 * Invite an affiliate to their page: link them to a member account (found by email, or
 * created holding nothing) and email them the way in. Sending again re-sends the email.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const refused = await admin()
  if (refused) return refused

  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Enter a valid email.' }, { status: 400 })
  }

  const result = await inviteAffiliate(params.id, parsed.data.email)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}

/**
 * Take the affiliate page away from the linked account. The account itself, and the
 * affiliate's history, stay — nothing is deleted.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const refused = await admin()
  if (refused) return refused

  const updated = await db.affiliate.updateMany({ where: { id: params.id }, data: { memberId: null } })
  if (updated.count === 0) return NextResponse.json({ error: 'Affiliate not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
