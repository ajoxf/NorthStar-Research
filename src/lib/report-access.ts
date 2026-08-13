import 'server-only'

import { randomUUID } from 'crypto'
import { SignJWT, jwtVerify } from 'jose'

import { requireEnv } from '@/lib/env'

/**
 * Short-lived, per-member signed URLs for report payloads (build spec §7).
 *
 * What this buys us, honestly:
 *   - Report bytes are never served from a public, permanent URL.
 *   - A token is bound to one member id AND one report id, and expires in minutes,
 *     so a copied link is useless to anyone else and useless to *anyone* shortly after.
 *   - Minting a token requires a live, authenticated session with an active
 *     subscription, so the email/WhatsApp links in §5.5 are just notifications:
 *     following one without a session lands on /login, never on report content.
 *
 * What this does NOT buy us: it cannot stop a member from photographing their own
 * screen or re-sharing content they can legitimately see. The watermark and the
 * ReportView audit log are the mitigations for that — they make leaks *traceable*,
 * not impossible. Do not describe this scheme as unbreakable.
 */

const TOKEN_TTL_SECONDS = 12 * 60 // 12 minutes — inside the 10–15 min band in §7.

export type ReportTokenPayload = {
  tokenId: string
  memberId: string
  reportId: string
  /** `download` additionally permits the watermarked offline copy. */
  scope: 'view' | 'download'
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(requireEnv('AUTH_SECRET', 'Signed report URLs'))
}

export async function mintReportToken(
  memberId: string,
  reportId: string,
  scope: 'view' | 'download' = 'view',
): Promise<{ token: string; tokenId: string; expiresAt: Date }> {
  const tokenId = randomUUID()
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000)

  const token = await new SignJWT({ memberId, reportId, scope })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(tokenId)
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .setAudience('report-access')
    .sign(secretKey())

  return { token, tokenId, expiresAt }
}

export async function verifyReportToken(token: string): Promise<ReportTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { audience: 'report-access' })
    if (!payload.jti || !payload.memberId || !payload.reportId) return null
    return {
      tokenId: payload.jti,
      memberId: String(payload.memberId),
      reportId: String(payload.reportId),
      scope: payload.scope === 'download' ? 'download' : 'view',
    }
  } catch {
    return null
  }
}

export const REPORT_TOKEN_TTL_SECONDS = TOKEN_TTL_SECONDS
