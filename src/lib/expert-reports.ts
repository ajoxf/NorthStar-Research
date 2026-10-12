import 'server-only'

import { db } from '@/lib/db'
import { appBaseUrl } from '@/lib/env'
import { getNotificationProvider } from '@/lib/notifications'
import { EXPERT_PAGE } from '@/lib/portal-account'
import { sectionName } from '@/lib/section-shape'

/**
 * Reports a subject matter expert uploads themselves.
 *
 * An expert's upload is an ordinary unpublished report with a submitter and a review
 * status, so everything the desk can do to a draft — edit it, attach another PDF, check
 * the audience — works on it unchanged. Publishing stays an admin-only act, and publishing
 * a submission is what approves it.
 */

export type ReviewResult = { ok: true } | { ok: false; error: string; status: number }

const reportsUrl = () => `${appBaseUrl()}${EXPERT_PAGE}#reports`

/** Tell every admin there is a report to review. Logged, never surfaced to the expert, on failure. */
export async function notifySubmission(reportId: string) {
  try {
    const report = await db.report.findUnique({
      where: { id: reportId },
      select: {
        title: true,
        submittedByAuthor: { select: { name: true } },
        section: { include: { topic: true, author: true } },
      },
    })
    if (!report) return
    const admins = await db.member.findMany({ where: { role: 'admin' }, select: { email: true } })
    const provider = getNotificationProvider()
    for (const admin of admins) {
      const result = await provider.sendExpertReportSubmitted(admin.email, {
        expert: report.submittedByAuthor?.name ?? 'An expert',
        title: report.title,
        section: report.section ? sectionName(report.section) : null,
        reviewUrl: `${appBaseUrl()}/admin/reports/${reportId}`,
      })
      if (result.status === 'failed') console.error(`[expert-reports] could not tell ${admin.email}: ${result.error}`)
    }
  } catch (error) {
    console.error('[expert-reports] could not notify admins', error)
  }
}

/** The expert takes back a submission nobody has reviewed yet. Kept on record, not deleted. */
export async function withdrawSubmission(reportId: string, authorId: string): Promise<ReviewResult> {
  const updated = await db.report.updateMany({
    where: { id: reportId, submittedByAuthorId: authorId, reviewStatus: 'pending', published: false },
    data: { reviewStatus: 'withdrawn' },
  })
  if (updated.count === 0) return { ok: false, error: 'Only a report still waiting for review can be withdrawn.', status: 409 }
  return { ok: true }
}

/** An admin sends a submission back with a reason. Nothing reaches members. */
export async function sendBackSubmission(reportId: string, adminId: string, reason: string): Promise<ReviewResult> {
  if (!reason.trim()) return { ok: false, error: 'Say why, so they can fix it.', status: 400 }
  const updated = await db.report.updateMany({
    where: { id: reportId, reviewStatus: 'pending', published: false },
    data: { reviewStatus: 'rejected', reviewNote: reason.trim().slice(0, 500), reviewedAt: new Date(), reviewedByMemberId: adminId },
  })
  if (updated.count === 0) return { ok: false, error: 'This report is not waiting for review.', status: 409 }
  await tellExpert(reportId, false, reason.trim())
  return { ok: true }
}

/**
 * Publishing an expert's submission is its approval. Called by the publish route; a no-op
 * for a desk upload, or for a submission already decided.
 */
export async function approveOnPublish(reportId: string, adminId: string) {
  const updated = await db.report.updateMany({
    where: { id: reportId, reviewStatus: { in: ['pending', 'rejected'] } },
    data: { reviewStatus: 'approved', reviewNote: null, reviewedAt: new Date(), reviewedByMemberId: adminId },
  })
  if (updated.count > 0) await tellExpert(reportId, true, null)
}

async function tellExpert(reportId: string, approved: boolean, reason: string | null) {
  try {
    const report = await db.report.findUnique({
      where: { id: reportId },
      select: { title: true, submittedByAuthor: { select: { name: true, memberId: true } } },
    })
    const memberId = report?.submittedByAuthor?.memberId
    const member = memberId ? await db.member.findUnique({ where: { id: memberId }, select: { email: true, firstName: true } }) : null
    if (!report || !member) return
    const result = await getNotificationProvider().sendExpertReportDecided(
      { email: member.email, name: member.firstName ?? report.submittedByAuthor?.name ?? null },
      { title: report.title, approved, reason, url: reportsUrl() },
    )
    if (result.status === 'failed') console.error(`[expert-reports] could not tell ${member.email}: ${result.error}`)
  } catch (error) {
    console.error('[expert-reports] could not send the decision email', error)
  }
}

/** The expert's own submissions, newest first, for their page. */
export async function submissionsFor(authorId: string) {
  return db.report.findMany({
    where: { submittedByAuthorId: authorId },
    orderBy: { submittedAt: 'desc' },
    take: 50,
    select: {
      id: true,
      title: true,
      publishDate: true,
      submittedAt: true,
      reviewStatus: true,
      reviewNote: true,
      published: true,
      publishedAt: true,
      section: { include: { topic: true, author: true } },
    },
  })
}
