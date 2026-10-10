import 'server-only'

import type { Member } from '@prisma/client'

import { memberHasAnyAccess } from '@/lib/auth'
import { db } from '@/lib/db'
import { appBaseUrl } from '@/lib/env'
import { getNotificationProvider, providerNames } from '@/lib/notifications'

/**
 * Member accounts for the people the platform pays: affiliates and subject matter experts.
 *
 * Both sign in through the ordinary member account — there is one login system, not three.
 * Being invited links an existing member, or creates one holding nothing, since neither an
 * affiliate nor an expert need subscribe.
 */

export const AFFILIATE_PAGE = '/affiliate'
export const EXPERT_PAGE = '/expert'

export type InviteResult =
  | { ok: true; created: boolean; sent: boolean; note?: string }
  | { ok: false; error: string; status: number }

/** The member with this email, or a new one holding nothing, named after the invitee. */
export async function findOrCreatePortalMember(email: string, name: string): Promise<{ member: Member; created: boolean }> {
  const existing = await db.member.findUnique({ where: { email } })
  if (existing) return { member: existing, created: false }
  const [firstName, ...rest] = name.trim().split(/\s+/)
  const member = await db.member.create({
    data: { email, firstName: firstName || null, lastName: rest.join(' ') || null, source: 'admin_manual' },
  })
  return { member, created: true }
}

/**
 * Tell somebody their page is there.
 *
 * The email links to the sign-in page rather than carrying a sign-in token: an invitation
 * may sit unread for weeks, and a standing key to an account does not belong in an inbox.
 * They sign in by email link or Google, as any member can.
 */
export async function sendPortalInvite(
  role: 'affiliate' | 'expert',
  recipient: { email: string; name: string },
  created: boolean,
): Promise<InviteResult> {
  if (providerNames().email === 'console') {
    return {
      ok: true,
      created,
      sent: false,
      note: 'Linked, but no email provider is configured, so no invitation went out. Send them the sign-in page yourself.',
    }
  }
  const page = role === 'expert' ? EXPERT_PAGE : AFFILIATE_PAGE
  const result = await getNotificationProvider().sendPortalInvite(recipient, {
    role,
    signInUrl: `${appBaseUrl()}/login?next=${encodeURIComponent(page)}`,
  })
  if (result.status === 'failed') {
    return { ok: true, created, sent: false, note: 'Linked, but the invitation email failed. Try again from here.' }
  }
  return { ok: true, created, sent: true }
}

export async function isAffiliateMember(memberId: string): Promise<boolean> {
  return (await db.affiliate.count({ where: { memberId } })) > 0
}

export async function isExpertMember(memberId: string): Promise<boolean> {
  return (await db.author.count({ where: { memberId } })) > 0
}

/**
 * Where a member lands after signing in with no particular page asked for.
 *
 * An expert or affiliate who holds nothing else goes to their own page — not to the code
 * redemption page, which would tell them they have nothing.
 */
export async function landingFor(member: Member, otherwise: string): Promise<string> {
  if (member.role === 'admin') return '/admin'
  if (await memberHasAnyAccess(member)) return '/dashboard'
  if (await isExpertMember(member.id)) return EXPERT_PAGE
  if (await isAffiliateMember(member.id)) return AFFILIATE_PAGE
  return otherwise
}
