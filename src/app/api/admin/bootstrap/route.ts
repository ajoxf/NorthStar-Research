import { NextResponse } from 'next/server'
import { z } from 'zod'

import { emailSchema } from '@/lib/validation'

import { db } from '@/lib/db'
import { hashPassword, startSession } from '@/lib/auth'
import { isPlaceholder } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * One-time creation of the very first administrator.
 *
 * Exists so the first admin can be created from a browser without a local checkout. It is
 * guarded three ways, because an unprotected version of this endpoint would hand anyone
 * the member list:
 *
 *   1. It requires `ADMIN_BOOTSTRAP_SECRET`, and refuses to run if that is unset or still
 *      a placeholder — so it is inert on any deployment that has not deliberately enabled it.
 *   2. It refuses once *any* admin exists. After the first successful call it can never
 *      create another, whatever secret is presented.
 *   3. It compares the secret in constant time and gives one generic error for every
 *      failure, so it cannot be used to probe whether an admin already exists.
 *
 * Delete `ADMIN_BOOTSTRAP_SECRET` from Vercel once you are in. Further admins are made by
 * promoting a member with `npm run create-admin`.
 */

const schema = z.object({
  secret: z.string().min(1),
  email: emailSchema,
  password: z.string().min(12, 'Use at least 12 characters for an admin password.'),
})

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function POST(request: Request) {
  const configured = process.env.ADMIN_BOOTSTRAP_SECRET

  // Deliberately generic: never reveal which of the guards rejected the request.
  const rejected = NextResponse.json(
    { error: 'Bootstrap is not available.' },
    { status: 403 },
  )

  if (isPlaceholder(configured)) {
    console.error('[admin:bootstrap] refused — ADMIN_BOOTSTRAP_SECRET is not set')
    return rejected
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the details you entered.' },
      { status: 400 },
    )
  }

  if (!constantTimeEquals(parsed.data.secret, configured as string)) {
    console.error('[admin:bootstrap] refused — incorrect secret')
    return rejected
  }

  const adminCount = await db.member.count({ where: { role: 'admin' } })
  if (adminCount > 0) {
    console.error('[admin:bootstrap] refused — an administrator already exists')
    return rejected
  }

  const email = parsed.data.email.trim().toLowerCase()
  const passwordHash = await hashPassword(parsed.data.password)

  const admin = await db.member.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      role: 'admin',
      subscriptionStatus: 'active',
      subscriptionStartedAt: new Date(),
      source: 'admin_manual',
    },
    update: { role: 'admin', passwordHash, subscriptionStatus: 'active' },
  })

  await startSession(admin)

  console.info(`[admin:bootstrap] first administrator created: ${admin.email}`)
  return NextResponse.json({ ok: true, redirectTo: '/admin' })
}
