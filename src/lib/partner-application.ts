import 'server-only'

import { normaliseSlug } from '@/lib/affiliates'
import { inviteAffiliate } from '@/lib/affiliate-account'
import { db } from '@/lib/db'
import { appBaseUrl } from '@/lib/env'
import { getNotificationProvider } from '@/lib/notifications'

/**
 * The public "become a partner" application, and an admin's answer to it.
 *
 * An application is an Affiliate row with status `pending`: nothing new to keep in step,
 * and approving one is a status change rather than a copy. A pending or declined affiliate
 * attributes nothing — checkout, commission and click-counting all ask for active — so a
 * stranger's form submission can never start earning on its own.
 */

export type ApplicationInput = {
  name: string
  email: string
  slug: string
  website?: string | null
  promotion?: string | null
  /** The slug of the partner whose invite link they came from, if any. */
  invite?: string | null
}

export type ApplicationResult =
  | { ok: true }
  | { ok: false; error: string; field?: 'slug' | 'email'; status: number }

/** Applications at once, across everyone, before the form stops taking more for the day. */
const DAILY_CAP = 50

export async function applyAsPartner(input: ApplicationInput): Promise<ApplicationResult> {
  const email = input.email.trim().toLowerCase()
  const slug = normaliseSlug(input.slug)
  if (slug.length < 3) {
    return { ok: false, error: 'Choose a link name of at least 3 letters or numbers.', field: 'slug', status: 400 }
  }

  // A flood from a script fills the admins' inboxes; a quiet cap is enough at this size.
  const today = await db.affiliate.count({ where: { appliedAt: { gte: new Date(Date.now() - 86_400_000) } } })
  if (today >= DAILY_CAP) {
    return { ok: false, error: 'We are not taking more applications today. Please try again tomorrow.', status: 429 }
  }

  const already = await db.affiliate.findFirst({ where: { email: { equals: email, mode: 'insensitive' }, status: { in: ['pending', 'active', 'paused'] } }, select: { status: true } })
  if (already) {
    return {
      ok: false,
      error: already.status === 'pending' ? 'You have already applied — we will email you once it is reviewed.' : 'This email already has a partner account. Sign in to see it.',
      field: 'email',
      status: 409,
    }
  }

  // Slugs are never reused, a declined applicant's included: a link once printed stays theirs.
  if (await db.affiliate.findUnique({ where: { slug }, select: { id: true } })) {
    return { ok: false, error: 'That link name is taken — try another.', field: 'slug', status: 409 }
  }

  // An invite link puts them under that partner, one level deep: only a partner who is
  // active and not a sub-affiliate themselves can bring others in.
  const inviteSlug = normaliseSlug(input.invite ?? '')
  const master = inviteSlug
    ? await db.affiliate.findFirst({ where: { slug: inviteSlug, status: 'active', parentAffiliateId: null }, select: { id: true, name: true } })
    : null

  const affiliate = await db.affiliate.create({
    data: {
      slug,
      name: input.name.trim(),
      email,
      status: 'pending',
      website: input.website?.trim() || null,
      promotion: input.promotion?.trim() || null,
      appliedAt: new Date(),
      parentAffiliateId: master?.id ?? null,
    },
  })

  await notifyAdmins({
    name: affiliate.name,
    email,
    slug,
    website: affiliate.website,
    promotion: affiliate.promotion,
    invitedBy: master?.name ?? null,
    reviewUrl: `${safeBase()}/admin/affiliates/${affiliate.id}`,
  })
  return { ok: true }
}

/** One email per admin. A failure is logged, never shown to the applicant. */
async function notifyAdmins(application: Parameters<ReturnType<typeof getNotificationProvider>['sendPartnerApplication']>[1]) {
  try {
    const admins = await db.member.findMany({ where: { role: 'admin' }, select: { email: true } })
    const provider = getNotificationProvider()
    for (const admin of admins) {
      const result = await provider.sendPartnerApplication(admin.email, application)
      if (result.status === 'failed') console.error(`[partners] could not tell ${admin.email} about ${application.email}: ${result.error}`)
    }
  } catch (error) {
    console.error(`[partners] could not notify admins about ${application.email}`, error)
  }
}

export type ReviewResult = { ok: true; invited: boolean; message: string } | { ok: false; error: string; status: number }

/**
 * Approve or decline an application.
 *
 * Approving makes them active on the default terms (an admin adjusts those on the page
 * first if the deal is different) and sends the same invite to their page that an admin-
 * created affiliate gets. Declining keeps the row — nothing is deleted — and sends nothing.
 */
export async function reviewApplication(affiliateId: string, decision: 'approve' | 'decline'): Promise<ReviewResult> {
  const affiliate = await db.affiliate.findUnique({ where: { id: affiliateId }, select: { status: true } })
  if (!affiliate) return { ok: false, error: 'No such application.', status: 404 }
  if (affiliate.status !== 'pending') return { ok: false, error: 'This application has already been reviewed.', status: 409 }

  // Claimed with a conditional update, so two admins pressing at once review it once.
  const claimed = await db.affiliate.updateMany({
    where: { id: affiliateId, status: 'pending' },
    data: { status: decision === 'approve' ? 'active' : 'declined', reviewedAt: new Date() },
  })
  if (claimed.count === 0) return { ok: false, error: 'This application has already been reviewed.', status: 409 }
  if (decision === 'decline') return { ok: true, invited: false, message: 'Application declined' }

  const invite = await inviteAffiliate(affiliateId)
  if (!invite.ok) return { ok: true, invited: false, message: `Approved, but the invite failed: ${invite.error}` }
  // Say what actually happened: with no email provider the account is linked but no email went.
  return invite.sent
    ? { ok: true, invited: true, message: 'Approved — they have been emailed a link to their page' }
    : { ok: true, invited: false, message: `Approved. ${invite.note ?? 'No invitation email went out.'}` }
}

function safeBase(): string {
  try {
    return appBaseUrl()
  } catch {
    return ''
  }
}
