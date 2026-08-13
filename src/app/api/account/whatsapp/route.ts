import { NextResponse } from 'next/server'
import { createHash, randomInt } from 'crypto'
import { SignJWT, jwtVerify } from 'jose'
import { z } from 'zod'

import { db } from '@/lib/db'
import { getCurrentMember } from '@/lib/auth'
import { appBaseUrl, requireEnv } from '@/lib/env'
import { getNotificationProvider } from '@/lib/notifications'
import { normalisePhone } from '@/lib/utils'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * WhatsApp number verification.
 *
 * The challenge lives in a short-lived signed token handed back to the client rather
 * than in a database column: it keeps a one-off flow from adding schema surface, and the
 * token carries only a hash of the code, so it is useless to whoever holds it.
 *
 * Verification matters because delivery skips unverified numbers — a typo would
 * otherwise send someone else's report link to a stranger.
 */

const CHALLENGE_TTL_SECONDS = 10 * 60

function secretKey(): Uint8Array {
  return new TextEncoder().encode(requireEnv('AUTH_SECRET', 'WhatsApp verification'))
}

function hashCode(code: string, memberId: string): string {
  return createHash('sha256').update(`${memberId}:${code}`).digest('hex')
}

const startSchema = z.object({
  phoneNumber: z.string().min(6),
  optIn: z.boolean().optional(),
})

/** Step 1 — save the number, send a 6-digit challenge to it. */
export async function POST(request: Request) {
  const member = await getCurrentMember()
  if (!member) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  const parsed = startSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid phone number.' }, { status: 400 })
  }

  const phoneNumber = normalisePhone(parsed.data.phoneNumber)
  if (!phoneNumber) {
    return NextResponse.json(
      { error: 'That does not look like a phone number. Include the country code.' },
      { status: 400 },
    )
  }

  await db.member.update({
    where: { id: member.id },
    data: { phoneNumber, whatsappOptIn: true, whatsappVerified: false },
  })

  const code = String(randomInt(100000, 1000000))
  const challenge = await new SignJWT({
    memberId: member.id,
    phoneNumber,
    codeHash: hashCode(code, member.id),
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${CHALLENGE_TTL_SECONDS}s`)
    .setAudience('whatsapp-verify')
    .sign(secretKey())

  const result = await getNotificationProvider().sendRedemptionCodeWhatsApp(
    { phoneNumber },
    code,
    `${appBaseUrl()}/account`,
  )

  if (result.status === 'failed') {
    return NextResponse.json(
      {
        error:
          'We could not send a WhatsApp message to that number. Check it and try again, or contact support.',
      },
      { status: 502 },
    )
  }

  return NextResponse.json({ ok: true, challenge, phoneNumber })
}

const verifySchema = z.object({
  challenge: z.string().min(10),
  code: z.string().min(4),
})

/** Step 2 — confirm the challenge and mark the number verified. */
export async function PUT(request: Request) {
  const member = await getCurrentMember()
  if (!member) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  const parsed = verifySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter the 6-digit code we sent you.' }, { status: 400 })
  }

  try {
    const { payload } = await jwtVerify(parsed.data.challenge, secretKey(), {
      audience: 'whatsapp-verify',
    })

    if (payload.memberId !== member.id) {
      return NextResponse.json({ error: 'That code is not valid.' }, { status: 400 })
    }

    const expected = hashCode(parsed.data.code.trim(), member.id)
    if (payload.codeHash !== expected) {
      return NextResponse.json({ error: 'That code is not correct. Check and try again.' }, { status: 400 })
    }

    await db.member.update({
      where: { id: member.id },
      data: {
        phoneNumber: String(payload.phoneNumber),
        whatsappOptIn: true,
        whatsappVerified: true,
      },
    })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json(
      { error: 'That code has expired. Request a new one.' },
      { status: 400 },
    )
  }
}

/** Turn WhatsApp delivery off. The number is kept so it can be re-enabled easily. */
export async function DELETE() {
  const member = await getCurrentMember()
  if (!member) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  await db.member.update({
    where: { id: member.id },
    data: { whatsappOptIn: false, whatsappVerified: false },
  })

  return NextResponse.json({ ok: true })
}
