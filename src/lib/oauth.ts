import 'server-only'

import { randomBytes } from 'crypto'
import { SignJWT, jwtVerify } from 'jose'

import { appBaseUrl, isConfigured, requireEnv } from '@/lib/env'

/**
 * Google sign-in and magic links, built on the existing session cookie.
 *
 * These extend the hand-rolled auth in `auth.ts` rather than replacing it with Auth.js:
 * the session, the server-side role re-check and the subscription gate already work and
 * are load-bearing, so adding two sign-in routes is far less risky than swapping the
 * foundation underneath them.
 *
 * Signing in is identity only. It never grants access — a member still needs an active
 * subscription, which is checked separately on every gated route.
 */

export const OAUTH_STATE_COOKIE = 'nsr_oauth_state'

export const GOOGLE_ENV_KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const

export function googleConfigured(): boolean {
  return isConfigured(...GOOGLE_ENV_KEYS)
}

export function googleRedirectUri(): string {
  return `${appBaseUrl()}/api/auth/google/callback`
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(requireEnv('AUTH_SECRET', 'Sign-in'))
}

/** Opaque CSRF state, also carrying the post-login destination. */
export function createOAuthState(next: string | null): { state: string; nonce: string } {
  const nonce = randomBytes(16).toString('hex')
  const payload = JSON.stringify({ nonce, next })
  return { state: Buffer.from(payload).toString('base64url'), nonce }
}

export function parseOAuthState(state: string): { nonce: string; next: string | null } | null {
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString('utf8'))
    if (typeof parsed.nonce !== 'string') return null
    return { nonce: parsed.nonce, next: typeof parsed.next === 'string' ? parsed.next : null }
  } catch {
    return null
  }
}

export function googleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: requireEnv('GOOGLE_CLIENT_ID', 'Google sign-in'),
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    // Only what is needed to identify the member — no sensitive scopes, so Google does
    // not require app verification for this.
    scope: 'openid email profile',
    state,
    prompt: 'select_account',
    access_type: 'online',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export type GoogleProfile = {
  sub: string
  email: string
  emailVerified: boolean
  firstName: string | null
  lastName: string | null
}

/** Exchange the one-time code for the user's profile. */
export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: requireEnv('GOOGLE_CLIENT_ID', 'Google sign-in'),
      client_secret: requireEnv('GOOGLE_CLIENT_SECRET', 'Google sign-in'),
      redirect_uri: googleRedirectUri(),
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  })

  if (!tokenResponse.ok) {
    throw new Error(`Google token exchange failed: HTTP ${tokenResponse.status}`)
  }

  const tokens = (await tokenResponse.json()) as { access_token?: string }
  if (!tokens.access_token) throw new Error('Google did not return an access token.')

  // Read the profile from the userinfo endpoint over TLS rather than decoding the
  // id_token ourselves — it avoids hand-rolling JWKS verification for no benefit here.
  const profileResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    cache: 'no-store',
  })

  if (!profileResponse.ok) {
    throw new Error(`Google userinfo failed: HTTP ${profileResponse.status}`)
  }

  const profile = (await profileResponse.json()) as {
    sub: string
    email?: string
    email_verified?: boolean
    given_name?: string
    family_name?: string
  }

  if (!profile.email) throw new Error('Google account has no email address.')

  return {
    sub: profile.sub,
    email: profile.email.toLowerCase(),
    emailVerified: profile.email_verified !== false,
    firstName: profile.given_name ?? null,
    lastName: profile.family_name ?? null,
  }
}

const MAGIC_LINK_TTL_SECONDS = 15 * 60

/** Single-use-ish magic link token. Short-lived and bound to one email address. */
export async function createMagicLinkToken(email: string, next: string | null): Promise<string> {
  return new SignJWT({ email, next })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAGIC_LINK_TTL_SECONDS}s`)
    .setAudience('magic-link')
    .sign(secretKey())
}

export async function verifyMagicLinkToken(
  token: string,
): Promise<{ email: string; next: string | null } | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: 'magic-link' })
    if (typeof payload.email !== 'string') return null
    return { email: payload.email, next: typeof payload.next === 'string' ? payload.next : null }
  } catch {
    return null
  }
}

export const MAGIC_LINK_TTL_MINUTES = MAGIC_LINK_TTL_SECONDS / 60

/** Only same-origin relative paths, so a login link can never become an open redirect. */
export function safeNext(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  return value
}
