import 'server-only'

import { cookies, headers } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import type { Member, Role } from '@prisma/client'

import { db } from '@/lib/db'
import { requireEnv } from '@/lib/env'

const SESSION_COOKIE = 'nsr_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30 // 30 days

export type SessionPayload = {
  sub: string
  email: string
  role: Role
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(requireEnv('AUTH_SECRET', 'Session authentication'))
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey())
}

export async function startSession(member: Pick<Member, 'id' | 'email' | 'role'>): Promise<void> {
  const token = await createSessionToken({
    sub: member.id,
    email: member.email,
    role: member.role,
  })

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })

  await db.member.update({
    where: { id: member.id },
    data: { lastLoginAt: new Date() },
  })
}

export function endSession(): void {
  cookies().delete(SESSION_COOKIE)
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = cookies().get(SESSION_COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, secretKey())
    if (!payload.sub) return null
    return {
      sub: payload.sub,
      email: String(payload.email ?? ''),
      role: (payload.role === 'admin' ? 'admin' : 'member') as Role,
    }
  } catch {
    // Expired or tampered token — treat as logged out rather than erroring.
    return null
  }
}

/**
 * Resolve the session against the database on every call.
 *
 * The cookie is only a claim. Role and subscription status are always re-read from
 * the database so that revoking a subscription or demoting an admin takes effect
 * immediately, without waiting for the JWT to expire.
 */
export async function getCurrentMember(): Promise<Member | null> {
  const session = await readSession()
  if (!session) return null

  const member = await db.member.findUnique({ where: { id: session.sub } })
  return member ?? null
}

export async function requireMember(): Promise<Member> {
  const member = await getCurrentMember()
  if (!member) throw new UnauthorizedError('You must be signed in.')
  return member
}

/**
 * Every /admin route and admin API handler calls this server-side. A client-side
 * role check is never sufficient on its own.
 */
export async function requireAdmin(): Promise<Member> {
  const member = await getCurrentMember()
  if (!member || member.role !== 'admin') {
    throw new ForbiddenError('Administrator access required.')
  }
  return member
}

/** An active subscription is what gates report content, separately from being logged in. */
export function hasActiveSubscription(member: Pick<Member, 'role' | 'subscriptionStatus'>): boolean {
  if (member.role === 'admin') return true
  return member.subscriptionStatus === 'active'
}

export class UnauthorizedError extends Error {
  status = 401
}

export class ForbiddenError extends Error {
  status = 403
}

/** Best-effort client IP + UA, recorded on every ReportView for leak tracing. */
export function requestFingerprint(): { ipAddress: string | null; userAgent: string | null } {
  const h = headers()
  const forwarded = h.get('x-forwarded-for')
  const ipAddress = forwarded ? forwarded.split(',')[0].trim() : h.get('x-real-ip')
  return { ipAddress: ipAddress || null, userAgent: h.get('user-agent') }
}
