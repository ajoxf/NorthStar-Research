import { NextResponse } from 'next/server'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { deliverReportToActiveMembers } from '@/lib/delivery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Send this report again to the members whose delivery failed — and only those.
 *
 * Scoped rather than a re-publish, which would walk the whole list again. The delivery
 * log's unique key means a second pass would skip everyone already delivered, so the
 * result is the same either way; the difference is that this cannot surprise anybody. An
 * operator clicking "retry 2 failures" should not set a job running against 400 members.
 *
 * Only members who are *still active* are retried. Someone whose delivery failed and who
 * has since lapsed is not owed this edition, and quietly mailing them would be sending
 * paid research to a former member.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const report = await db.report.findUnique({ where: { id: params.id } })
  if (!report) return NextResponse.json({ error: 'No such report.' }, { status: 404 })

  if (!report.published) {
    return NextResponse.json(
      { error: 'This report is still a draft. Publish it before sending anything.' },
      { status: 409 },
    )
  }

  const failed = await db.deliveryLog.findMany({
    where: { reportId: report.id, status: 'failed' },
    select: { memberId: true },
  })

  if (failed.length === 0) {
    return NextResponse.json({ ok: true, attempted: 0, sent: 0, failed: 0 })
  }

  const summary = await deliverReportToActiveMembers(report, {
    onlyMemberIds: failed.map((row) => row.memberId),
  })

  return NextResponse.json({
    ok: true,
    attempted: summary.attempted,
    sent: summary.sent,
    failed: summary.failed,
    // Non-zero when a failed member has since lapsed — they are excluded from the send,
    // and saying so is better than a count that silently does not add up.
    skippedInactive: failed.length - summary.attempted - summary.skipped,
  })
}
