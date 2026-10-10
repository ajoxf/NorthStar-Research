import 'server-only'

import { db } from '@/lib/db'
import { findOrCreatePortalMember, sendPortalInvite, type InviteResult } from '@/lib/portal-account'

/**
 * The affiliate record a member signs in as, if any.
 *
 * A closed affiliate keeps the page: commission they earned before closing is still theirs
 * to withdraw, and the page is the only place they can ask for it.
 */
export async function affiliateForMember(memberId: string) {
  return db.affiliate.findFirst({ where: { memberId }, orderBy: { createdAt: 'asc' } })
}

/**
 * Give an affiliate their page: link them to a member account and tell them it is there.
 * See portal-account.ts for which account, and why the email carries no sign-in token.
 */
export async function inviteAffiliate(affiliateId: string, emailInput?: string | null): Promise<InviteResult> {
  const affiliate = await db.affiliate.findUnique({ where: { id: affiliateId } })
  if (!affiliate) return { ok: false, error: 'No such affiliate.', status: 404 }
  if (affiliate.status === 'closed') return { ok: false, error: 'This affiliate is closed.', status: 409 }

  const email = (emailInput || affiliate.email).trim().toLowerCase()
  if (!email) return { ok: false, error: 'Give the affiliate an email address first.', status: 400 }

  const existing = await db.member.findUnique({ where: { email }, select: { id: true } })
  if (existing) {
    const other = await db.affiliate.findFirst({
      where: { memberId: existing.id, id: { not: affiliate.id } },
      select: { name: true },
    })
    if (other) return { ok: false, error: `That account is already linked to ${other.name}.`, status: 409 }
  }

  const { member, created } = await findOrCreatePortalMember(email, affiliate.name)
  await db.affiliate.update({ where: { id: affiliate.id }, data: { memberId: member.id } })
  return sendPortalInvite('affiliate', { email, name: affiliate.name }, created)
}
