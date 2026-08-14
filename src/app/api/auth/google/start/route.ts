import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

import { MissingConfigError } from '@/lib/env'
import { OAUTH_STATE_COOKIE, createOAuthState, googleAuthUrl, safeNext } from '@/lib/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Kick off Google sign-in. */
export async function GET(request: Request) {
  const next = safeNext(new URL(request.url).searchParams.get('next'))

  try {
    const { state, nonce } = createOAuthState(next)

    // The nonce goes in an httpOnly cookie and is compared on the way back, so a forged
    // callback from another origin cannot complete a sign-in.
    cookies().set(OAUTH_STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 600,
    })

    return NextResponse.redirect(googleAuthUrl(state))
  } catch (error) {
    if (error instanceof MissingConfigError) {
      console.error(`[auth:google] ${error.message}`)
      return NextResponse.redirect(
        new URL('/login?error=google_unavailable', process.env.APP_BASE_URL ?? request.url),
      )
    }
    throw error
  }
}
