import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { db } from '@/lib/db'
import { hasActiveSubscription, startSession } from '@/lib/auth'
import { appBaseUrl } from '@/lib/env'
import { OAUTH_STATE_COOKIE, exchangeGoogleCode, parseOAuthState, safeNext } from '@/lib/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Complete Google sign-in.
 *
 * Signing in is identity, not entitlement. A Google account with no membership behind it
 * lands on /redeem to enter a code, not on the reports — otherwise anyone with a Google
 * account would be inside the paywall.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const base = appBaseUrl()

  const error = url.searchParams.get('error')
  if (error) {
    return NextResponse.redirect(`${base}/login?error=google_cancelled`)
  }

  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expectedNonce = cookies().get(OAUTH_STATE_COOKIE)?.value
  cookies().delete(OAUTH_STATE_COOKIE)

  if (!code || !state || !expectedNonce) {
    return NextResponse.redirect(`${base}/login?error=google_failed`)
  }

  const parsedState = parseOAuthState(state)
  if (!parsedState || parsedState.nonce !== expectedNonce) {
    console.error('[auth:google] state mismatch — possible CSRF attempt')
    return NextResponse.redirect(`${base}/login?error=google_failed`)
  }

  let profile
  try {
    profile = await exchangeGoogleCode(code)
  } catch (err) {
    console.error('[auth:google] code exchange failed', err)
    return NextResponse.redirect(`${base}/login?error=google_failed`)
  }

  // An unverified Google email could belong to someone else; refuse to link it to a
  // paid membership on that basis.
  if (!profile.emailVerified) {
    return NextResponse.redirect(`${base}/login?error=google_unverified`)
  }

  const existing =
    (await db.member.findUnique({ where: { googleId: profile.sub } })) ??
    (await db.member.findUnique({ where: { email: profile.email } }))

  const member = existing
    ? await db.member.update({
        where: { id: existing.id },
        data: {
          // Link Google to the account matched by email, so a member who paid with a
          // password account can switch to Google without losing their subscription.
          googleId: profile.sub,
          firstName: existing.firstName ?? profile.firstName,
          lastName: existing.lastName ?? profile.lastName,
        },
      })
    : await db.member.create({
        data: {
          email: profile.email,
          googleId: profile.sub,
          firstName: profile.firstName,
          lastName: profile.lastName,
          role: 'member',
          // No payment has been seen for this person — they must redeem a code.
          subscriptionStatus: 'pending',
          source: 'admin_manual',
        },
      })

  await startSession(member)

  const next = safeNext(parsedState.next)
  if (next) return NextResponse.redirect(`${base}${next}`)
  if (member.role === 'admin') return NextResponse.redirect(`${base}/admin`)
  if (!hasActiveSubscription(member)) return NextResponse.redirect(`${base}/redeem`)
  return NextResponse.redirect(`${base}/dashboard`)
}
