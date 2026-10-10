import 'server-only'

import type { Member } from '@prisma/client'

import { memberHasAnyAccess } from '@/lib/auth'
import { db } from '@/lib/db'
import { appBaseUrl } from '@/lib/env'
import { getNotificationProvider, providerNames } from '@/lib/notifications'

/** Where an affiliate's page lives in the member portal. */
export const AFFILIATE_PAGE = '/affiliate'

/**
 * The affiliate record a member signs in as, if any.
 *
 * A closed affiliate keeps the page: commission they earned before closing is still theirs
 * to withdraw, and the page is the only place they can ask for it.
 */
export async function affiliateForMember(memberId: string) {
  return db.affiliate.findFirst({ where: { memberId }, orderBy: { createdAt: 'asc' } })
}

export async function isAffiliateMember(memberId: string): Promise<boolean> {
  return (await db.affiliate.count({ where: { memberId } })) > 0
}

export type InviteResult =
  | { ok: true; created: boolean; sent: boolean; note?: string }
  | { ok: false; error: string; status: number }

/**
 * Give an affiliate their page: link them to a member account and tell them it is there.
 *
 * The account is the member with that email, or a new one holding nothing — an affiliate
 * need not subscribe. The email links to the sign-in page rather than carrying a sign-in
 * token: an invitation may sit unread for weeks, and a standing key to an account does not
 * belong in an inbox. They sign in by email link or Google, as any member can.
 */
export async function inviteAffiliate(affiliateId: string, emailInput?: string | null): Promise<InviteResult> {
  const affiliate = await db.affiliate.findUnique({ where: { id: affiliateId } })
  if (!affiliate) return { ok: false, error: 'No such affiliate.', status: 404 }
  if (affiliate.status === 'closed') return { ok: false, error: 'This affiliate is closed.', status: 409 }

  const email = (emailInput || affiliate.email).trim().toLowerCase()
  if (!email) return { ok: false, error: 'Give the affiliate an email address first.', status: 400 }

  let member = await db.member.findUnique({ where: { email } })
  const created = !member
  if (member) {
    const other = await db.affiliate.findFirst({
      where: { memberId: member.id, id: { not: affiliate.id } },
      select: { name: true },
    })
    if (other) {
      return { ok: false, error: `That account is already linked to ${other.name}.`, status: 409 }
    }
  } else {
    const [firstName, ...rest] = affiliate.name.trim().split(/\s+/)
    member = await db.member.create({
      data: { email, firstName: firstName || null, lastName: rest.join(' ') || null, source: 'admin_manual' },
    })
  }

  await db.affiliate.update({ where: { id: affiliate.id }, data: { memberId: member.id } })

  if (providerNames().email === 'console') {
    return {
      ok: true,
      created,
      sent: false,
      note: 'Linked, but no email provider is configured, so no invitation went out. Send them the sign-in page yourself.',
    }
  }
  const result = await getNotificationProvider().sendAffiliateInvite(
    { email, name: affiliate.name },
    `${appBaseUrl()}/login?next=${encodeURIComponent(AFFILIATE_PAGE)}`,
  )
  if (result.status === 'failed') {
    return { ok: true, created, sent: false, note: 'Linked, but the invitation email failed. Try again from here.' }
  }
  return { ok: true, created, sent: true }
}

/**
 * Where a member lands after signing in with no particular page asked for.
 *
 * An affiliate who holds nothing else goes to their affiliate page — not to the code
 * redemption page, which would tell them they have nothing.
 */
export async function landingFor(member: Member, otherwise: string): Promise<string> {
  if (member.role === 'admin') return '/admin'
  if (await memberHasAnyAccess(member)) return '/dashboard'
  if (await isAffiliateMember(member.id)) return AFFILIATE_PAGE
  return otherwise
}
