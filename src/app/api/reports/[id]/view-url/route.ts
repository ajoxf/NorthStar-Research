import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { getCurrentMember, hasActiveSubscription } from '@/lib/auth'
import { REPORT_TOKEN_TTL_SECONDS, mintReportToken } from '@/lib/report-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Mint a short-lived URL so the in-app reader can fetch the PDF bytes and render its
 * pages. Same protection as the download path — a token bound to one member and one
 * report, expiring in minutes — but a different intent:
 *
 *   - `/download` marks the ReportView as `downloaded`, because the member took a copy.
 *   - This does not. The page load already recorded the view; flagging it as a download
 *     too would make the leak-tracing signal in the admin CRM useless.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const member = await getCurrentMember()
  if (!member) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  }
  if (!hasActiveSubscription(member)) {
    return NextResponse.json({ error: 'Your membership is not active.' }, { status: 403 })
  }

  const report = await db.report.findUnique({ where: { id: params.id } })
  if (!report || (!report.published && member.role !== 'admin')) {
    return NextResponse.json({ error: 'Report not found.' }, { status: 404 })
  }
  if (!report.pdfBlobUrl) {
    return NextResponse.json({ error: 'This report has no document.' }, { status: 404 })
  }

  const { token } = await mintReportToken(member.id, report.id, 'view')

  return NextResponse.json({
    url: `/api/reports/${report.id}/file?token=${encodeURIComponent(token)}`,
    expiresInSeconds: REPORT_TOKEN_TTL_SECONDS,
  })
}
