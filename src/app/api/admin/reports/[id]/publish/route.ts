import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { deliverReportToActiveMembers } from '@/lib/delivery'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// A send iterates the whole member list; give it room.
export const maxDuration = 300

/**
 * Publish a report and deliver it to every active member.
 *
 * Note this calls `deliverReportToActiveMembers`, which talks to the NotificationProvider
 * interface — no Resend or Twilio SDK is reachable from here (build spec §9). Swapping in
 * Kit later does not touch this file.
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
  if (!report) {
    return NextResponse.json({ error: 'Report not found.' }, { status: 404 })
  }

  const published = await db.report.update({
    where: { id: report.id },
    data: report.published
      ? {}
      : { published: true, publishedAt: new Date() },
  })

  // Idempotent: members who already received this report are skipped, so re-publishing
  // to catch stragglers after a partial failure will not send anyone a duplicate.
  const summary = await deliverReportToActiveMembers(published)

  return NextResponse.json({ ok: true, summary })
}

/** Un-publish — hides a report from members without deleting anything (requirement 3). */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  await db.report.update({ where: { id: params.id }, data: { published: false } })
  return NextResponse.json({ ok: true })
}
