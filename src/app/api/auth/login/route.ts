import { NextResponse } from 'next/server'
import { z } from 'zod'

import { emailSchema } from '@/lib/validation'

import { db } from '@/lib/db'
import { startSession, verifyPassword } from '@/lib/auth'

export const runtime = 'nodejs'

const schema = z.object({
  email: emailSchema,
  password: z.string().min(1),
})

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter your email address and password.' }, { status: 400 })
  }

  const email = parsed.data.email
  const member = await db.member.findUnique({ where: { email } })

  // Same message and roughly the same work whether the account exists or the password
  // is wrong — no enumerating which emails are members.
  const invalid = NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 })

  if (!member?.passwordHash) {
    await verifyPassword(parsed.data.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv')
    return invalid
  }

  const ok = await verifyPassword(parsed.data.password, member.passwordHash)
  if (!ok) return invalid

  await startSession(member)

  return NextResponse.json({
    ok: true,
    role: member.role,
    // The client decides where to land: admins to the console, members to the report
    // they originally clicked (the `next` param) or their dashboard.
    redirectTo: member.role === 'admin' ? '/admin' : '/dashboard',
  })
}
