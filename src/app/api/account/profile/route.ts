import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { getCurrentMember, hashPassword, verifyPassword } from '@/lib/auth'

export const runtime = 'nodejs'

const schema = z.object({
  firstName: z.string().trim().max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(10).optional(),
})

export async function PATCH(request: Request) {
  const member = await getCurrentMember()
  if (!member) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the details you entered.' },
      { status: 400 },
    )
  }

  const data: Record<string, unknown> = {
    firstName: parsed.data.firstName ?? null,
    lastName: parsed.data.lastName ?? null,
  }

  if (parsed.data.newPassword) {
    // Changing a password always requires proving the current one — a hijacked session
    // should not be able to lock the real member out.
    if (!parsed.data.currentPassword || !member.passwordHash) {
      return NextResponse.json({ error: 'Enter your current password.' }, { status: 400 })
    }
    const ok = await verifyPassword(parsed.data.currentPassword, member.passwordHash)
    if (!ok) {
      return NextResponse.json({ error: 'Your current password is not correct.' }, { status: 400 })
    }
    data.passwordHash = await hashPassword(parsed.data.newPassword)
  }

  await db.member.update({ where: { id: member.id }, data })
  return NextResponse.json({ ok: true })
}
