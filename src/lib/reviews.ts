import 'server-only'

import { db } from '@/lib/db'
import { maskName } from '@/lib/partner-report-shape'
import { REVIEW_BODY_MAX, parseRating, performanceClaim, summariseRatings, type RatingSummary } from '@/lib/review-shape'

/**
 * Section reviews: written by any signed-in member, shown only once an admin approves them,
 * and only on a section the admin has opened to reviews.
 */

export type SubmitResult = { ok: true; status: 'pending' } | { ok: false; error: string; status: number }

/**
 * Write or rewrite the member's review of a section. Either way it goes (back) into the
 * queue: an approved review edited into a claim about returns must be read again before it
 * is shown, so editing hides it until then.
 */
export async function submitReview(memberId: string, input: { sectionId: string; rating: unknown; body?: string | null }): Promise<SubmitResult> {
  const rating = parseRating(input.rating)
  if (rating === null) return { ok: false, error: 'Choose between 1 and 5 stars.', status: 400 }
  const body = input.body?.trim().slice(0, REVIEW_BODY_MAX) || null

  const section = await db.section.findUnique({ where: { id: input.sectionId }, select: { reviewsEnabled: true, archivedAt: true } })
  if (!section || section.archivedAt) return { ok: false, error: 'That section is not available.', status: 404 }
  if (!section.reviewsEnabled) return { ok: false, error: 'Reviews are not open for this section yet.', status: 409 }

  // Verified: they hold or held this section — the badge readers use to weigh a review.
  const held = await db.entitlement.count({
    where: { memberId, sectionId: input.sectionId, status: { in: ['active', 'trialing', 'cancelled', 'expired'] } },
  })
  const data = { rating, body, status: 'pending' as const, flagReason: performanceClaim(body), verified: held > 0, decidedAt: null, decidedByMemberId: null }
  await db.sectionReview.upsert({
    where: { sectionId_memberId: { sectionId: input.sectionId, memberId } },
    create: { sectionId: input.sectionId, memberId, ...data },
    update: data,
  })
  return { ok: true, status: 'pending' }
}

export type DecideResult = { ok: true } | { ok: false; error: string; status: number }

/** Approve or reject a pending review. Only a pending one: a decision is not overwritten twice. */
export async function decideReview(reviewId: string, decision: 'approve' | 'reject', adminId: string): Promise<DecideResult> {
  const updated = await db.sectionReview.updateMany({
    where: { id: reviewId, status: 'pending' },
    data: { status: decision === 'approve' ? 'approved' : 'rejected', decidedAt: new Date(), decidedByMemberId: adminId },
  })
  if (updated.count === 0) {
    const exists = await db.sectionReview.count({ where: { id: reviewId } })
    return exists ? { ok: false, error: 'This review has already been decided.', status: 409 } : { ok: false, error: 'No such review.', status: 404 }
  }
  return { ok: true }
}

export type PublicReview = {
  id: string
  name: string
  verified: boolean
  rating: number
  body: string | null
  at: Date
}

/** Approved reviews and their summary, per section, for sections open to reviews. */
export async function publicReviews(sectionIds: string[]): Promise<Map<string, { summary: RatingSummary | null; reviews: PublicReview[] }>> {
  const result = new Map<string, { summary: RatingSummary | null; reviews: PublicReview[] }>()
  if (sectionIds.length === 0) return result
  const rows = await db.sectionReview.findMany({
    where: { sectionId: { in: sectionIds }, status: 'approved', section: { reviewsEnabled: true } },
    orderBy: { decidedAt: 'desc' },
    select: {
      id: true,
      sectionId: true,
      rating: true,
      body: true,
      verified: true,
      createdAt: true,
      member: { select: { firstName: true, lastName: true, email: true } },
    },
  })
  for (const id of sectionIds) {
    const mine = rows.filter((row) => row.sectionId === id)
    result.set(id, {
      summary: summariseRatings(mine.map((row) => row.rating)),
      reviews: mine.map((row) => ({
        id: row.id,
        name: maskName(row.member.firstName, row.member.lastName, row.member.email),
        verified: row.verified,
        rating: row.rating,
        body: row.body,
        at: row.createdAt,
      })),
    })
  }
  return result
}

/** Just the averages, for cards. */
export async function ratingSummaries(sectionIds: string[]): Promise<Map<string, RatingSummary>> {
  const map = new Map<string, RatingSummary>()
  if (sectionIds.length === 0) return map
  const groups = await db.sectionReview.groupBy({
    by: ['sectionId'],
    where: { sectionId: { in: sectionIds }, status: 'approved', section: { reviewsEnabled: true } },
    _avg: { rating: true },
    _count: true,
  })
  for (const group of groups) {
    if (group._count > 0 && group._avg.rating !== null) {
      map.set(group.sectionId, { average: Math.round(group._avg.rating * 10) / 10, count: group._count })
    }
  }
  return map
}

/** The signed-in member's own review of each section, whatever its state. */
export async function ownReviews(memberId: string, sectionIds: string[]) {
  if (sectionIds.length === 0) return new Map<string, { rating: number; body: string | null; status: string }>()
  const rows = await db.sectionReview.findMany({
    where: { memberId, sectionId: { in: sectionIds } },
    select: { sectionId: true, rating: true, body: true, status: true },
  })
  return new Map(rows.map((row) => [row.sectionId, { rating: row.rating, body: row.body, status: row.status }]))
}
