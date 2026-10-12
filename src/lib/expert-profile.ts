import 'server-only'

import { db } from '@/lib/db'
import { appBaseUrl } from '@/lib/env'
import { type ProfileFields, acceptableExpertPhoto, profileChanges, profileClaim } from '@/lib/expert-profile-shape'
import { getNotificationProvider } from '@/lib/notifications'
import { EXPERT_PAGE } from '@/lib/portal-account'

/**
 * An expert proposing changes to their own public profile, and an admin deciding on them.
 *
 * The draft never touches the Author row until approved — the public profile keeps saying
 * what the desk last agreed to, however many times the expert edits.
 */

const PROFILE_SELECT = {
  headline: true,
  bio: true,
  photoUrl: true,
  credentials: true,
  websiteUrl: true,
  linkedinUrl: true,
  xUrl: true,
} as const

export const PROFILE_REVIEW_PATH = '/admin/sections#profile-changes'

export type SubmitResult = { ok: true; changed: number } | { ok: false; error: string; status: number }

/** Save the expert's proposal and tell the admins. Submitting what is already live is refused. */
export async function submitProfileDraft(authorId: string, draft: ProfileFields, memberId: string): Promise<SubmitResult> {
  const author = await db.author.findUnique({ where: { id: authorId }, select: { name: true, ...PROFILE_SELECT } })
  if (!author) return { ok: false, error: 'No such expert.', status: 404 }
  if (!acceptableExpertPhoto(draft.photoUrl, author.photoUrl)) {
    return { ok: false, error: 'Upload your photograph with the button — a pasted image address cannot be used.', status: 400 }
  }

  const changes = profileChanges(author, draft)
  if (changes.length === 0) return { ok: false, error: 'That is the same as your live profile — nothing to send.', status: 409 }

  const data = { ...draft, status: 'pending' as const, submittedByMemberId: memberId, submittedAt: new Date(), decidedAt: null, decidedByMemberId: null, rejectReason: null }
  await db.authorProfileDraft.upsert({ where: { authorId }, create: { authorId, ...data }, update: data })

  try {
    const admins = await db.member.findMany({ where: { role: 'admin' }, select: { email: true } })
    const provider = getNotificationProvider()
    for (const admin of admins) {
      const result = await provider.sendExpertProfileSubmitted(admin.email, {
        expert: author.name,
        changed: changes.map((change) => change.label),
        flag: profileClaim(draft),
        reviewUrl: `${appBaseUrl()}${PROFILE_REVIEW_PATH}`,
      })
      if (result.status === 'failed') console.error(`[expert-profile] could not tell ${admin.email}: ${result.error}`)
    }
  } catch (error) {
    console.error('[expert-profile] could not notify admins', error)
  }
  return { ok: true, changed: changes.length }
}

export type DecideResult = { ok: true } | { ok: false; error: string; status: number }

/**
 * Approve (copy onto the live profile) or reject (with a reason the expert will read).
 * Only a pending draft can be decided, claimed with a conditional update so two admins
 * pressing at once decide it once.
 */
export async function decideProfileDraft(authorId: string, decision: 'approve' | 'reject', adminId: string, reason?: string | null): Promise<DecideResult> {
  if (decision === 'reject' && !reason?.trim()) return { ok: false, error: 'Say why, so they can fix it.', status: 400 }

  const result = await db.$transaction(async (tx) => {
    const claimed = await tx.authorProfileDraft.updateMany({
      where: { authorId, status: 'pending' },
      data: {
        status: decision === 'approve' ? 'approved' : 'rejected',
        decidedAt: new Date(),
        decidedByMemberId: adminId,
        rejectReason: decision === 'reject' ? reason!.trim().slice(0, 500) : null,
      },
    })
    if (claimed.count === 0) return { ok: false as const, error: 'There are no changes waiting for this expert.', status: 409 }
    if (decision === 'approve') {
      const draft = await tx.authorProfileDraft.findUniqueOrThrow({ where: { authorId }, select: PROFILE_SELECT })
      await tx.author.update({ where: { id: authorId }, data: draft })
    }
    return { ok: true as const }
  })
  if (result.ok) await tellExpert(authorId, decision === 'approve', reason?.trim() ?? null)
  return result
}

/**
 * Tell the expert what was decided. Best-effort, after the write: the decision stands
 * whether or not the email lands, and the expert's page says the same thing either way.
 */
async function tellExpert(authorId: string, approved: boolean, reason: string | null) {
  try {
    const author = await db.author.findUnique({ where: { id: authorId }, select: { name: true, slug: true, memberId: true } })
    const member = author?.memberId
      ? await db.member.findUnique({ where: { id: author.memberId }, select: { email: true, firstName: true } })
      : null
    if (!author || !member) return
    const result = await getNotificationProvider().sendExpertProfileDecided(
      { email: member.email, name: member.firstName ?? author.name },
      { approved, reason, url: `${appBaseUrl()}${approved ? `/experts/${author.slug}` : `${EXPERT_PAGE}#profile`}` },
    )
    if (result.status === 'failed') console.error(`[expert-profile] could not tell ${member.email} the decision: ${result.error}`)
  } catch (error) {
    console.error('[expert-profile] could not send the decision email', error)
  }
}

/** Every draft waiting for an admin, with what it would change. */
export async function pendingProfileDrafts() {
  const drafts = await db.authorProfileDraft.findMany({
    where: { status: 'pending' },
    orderBy: { submittedAt: 'asc' },
    select: { authorId: true, submittedAt: true, ...PROFILE_SELECT, author: { select: { name: true, slug: true, ...PROFILE_SELECT } } },
  })
  return drafts.map(({ author, authorId, submittedAt, ...draft }) => ({
    authorId,
    name: author.name,
    slug: author.slug,
    submittedAt,
    changes: profileChanges(author, draft),
    flag: profileClaim(draft),
  }))
}

/** The expert's own view: the live profile, and their latest draft if any. */
export async function profileForExpert(authorId: string) {
  const [live, draft] = await Promise.all([
    db.author.findUniqueOrThrow({ where: { id: authorId }, select: { name: true, slug: true, ...PROFILE_SELECT } }),
    db.authorProfileDraft.findUnique({ where: { authorId }, select: { status: true, submittedAt: true, decidedAt: true, rejectReason: true, ...PROFILE_SELECT } }),
  ])
  return { live, draft }
}
