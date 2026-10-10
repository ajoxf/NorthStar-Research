import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { inviteExpert } from '@/lib/expert-account'
import { emailSchema } from '@/lib/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ email: emailSchema })

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
 * Invite an expert to their page: link them to a member account (found by email, or
 * created holding nothing) and email them the way in. Sending again re-sends the email.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const refused = await admin()
  if (refused) return refused

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 })

  const result = await inviteExpert(params.id, parsed.data.email)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}

/** Take the expert page away from the linked account. The account and profile stay. */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const refused = await admin()
  if (refused) return refused

  const updated = await db.author.updateMany({ where: { id: params.id }, data: { memberId: null } })
  if (updated.count === 0) return NextResponse.json({ error: 'No such expert.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
