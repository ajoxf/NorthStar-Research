import { NextResponse } from 'next/server'
import { z } from 'zod'

import { emailSchema } from '@/lib/validation'

import { db } from '@/lib/db'
import { hasActiveSubscription, startSession } from '@/lib/auth'
import { appBaseUrl } from '@/lib/env'
import { getNotificationProvider, providerNames } from '@/lib/notifications'
import {
  MAGIC_LINK_TTL_MINUTES,
  createMagicLinkToken,
  safeNext,
  verifyMagicLinkToken,
} from '@/lib/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  email: emailSchema,
  // Nullable, not merely optional. The sign-in form always sends this key, and sends
  // `null` when there is no `?next=` on the URL — which is the common case. Zod's
  // `.optional()` accepts `undefined` and rejects `null`, so every magic-link request
  // from the actual form was failing validation before it reached the lookup. The screen
  // still said "check your email", because it ignored the response.
  next: z.string().nullable().optional(),
})

/** Request a magic link. */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 })
  }

  // Refuse before pretending. With no email provider configured the console fallback
  // reports every send as successful, so the form used to tell the visitor a link was on
  // its way when nothing had left the building — the single worst thing a sign-in screen
  // can do, because they will wait rather than try another route.
  //
  // Whether a provider is configured is a property of the deployment, not of any account,
  // so saying so leaks nothing an attacker could use to enumerate members.
  if (providerNames().email === 'console') {
    console.error('[auth:magic] refused: no email provider is configured')
    return NextResponse.json(
      {
        error:
          'Sign-in links are unavailable at the moment. Use your email and password, or contact support.',
      },
      { status: 503 },
    )
  }

  const email = parsed.data.email.toLowerCase()
  const member = await db.member.findUnique({ where: { email } })

  // Always answer identically whether or not the account exists — otherwise this
  // endpoint becomes a way to test which email addresses are paying members.
  const genericResponse = NextResponse.json({
    ok: true,
    message: 'If that email has an account, a sign-in link is on its way.',
  })

  if (!member) return genericResponse

  const token = await createMagicLinkToken(email, safeNext(parsed.data.next))
  const link = `${appBaseUrl()}/api/auth/magic?token=${encodeURIComponent(token)}`

  try {
    const result = await getNotificationProvider().sendMagicLink(
      { email, firstName: member.firstName },
      link,
      MAGIC_LINK_TTL_MINUTES,
    )
    if (result.status === 'failed') {
      console.error(`[auth:magic] send failed for ${email}: ${result.error}`)
    }
  } catch (error) {
    console.error('[auth:magic] send threw', error)
  }

  return genericResponse
}

/** Follow a magic link: verify, start the session, and route onward. */
export async function GET(request: Request) {
  const base = appBaseUrl()
  const token = new URL(request.url).searchParams.get('token')

  if (!token) return NextResponse.redirect(`${base}/login?error=link_invalid`)

  const payload = await verifyMagicLinkToken(token)
  if (!payload) return NextResponse.redirect(`${base}/login?error=link_expired`)

  const member = await db.member.findUnique({ where: { email: payload.email } })
  if (!member) return NextResponse.redirect(`${base}/login?error=link_invalid`)

  await startSession(member)

  const next = safeNext(payload.next)
  if (next) return NextResponse.redirect(`${base}${next}`)
  if (member.role === 'admin') return NextResponse.redirect(`${base}/admin`)
  if (!hasActiveSubscription(member)) return NextResponse.redirect(`${base}/redeem`)
  return NextResponse.redirect(`${base}/dashboard`)
}
