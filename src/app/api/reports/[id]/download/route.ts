import { NextResponse } from 'next/server'

import { canReadReport, hasAnyAccess } from '@/lib/entitlements'
import { db } from '@/lib/db'
import { getCurrentMember, loadEntitlements, requestFingerprint } from '@/lib/auth'
import { REPORT_TOKEN_TTL_SECONDS, mintReportToken } from '@/lib/report-access'
import { DOWNLOADS_DISABLED_MESSAGE, DOWNLOADS_ENABLED } from '@/lib/downloads'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Mint a short-lived download URL for the original PDF.
 *
 * Two steps on purpose: this POST authorises against the live session and records the
 * download, then hands back a URL valid for minutes only. The file route itself never
 * consults the session cookie, so the URL works exactly once in practice and cannot be
 * shared usefully.
 */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  /*
   * Checked before anything else, including the session.
   *
   * The button is gone from the reader, but a URL somebody already has — a bookmark, a
   * history entry, a script — would otherwise still mint a token and hand over the file.
   * Hiding a control is not disabling a feature.
   *
   * 403 rather than 404: the report exists and the member may well be entitled to read it.
   * What is refused is taking a copy away, and saying so plainly is what stops somebody
   * retrying and then writing in.
   */
  if (!DOWNLOADS_ENABLED) {
    return NextResponse.json({ error: DOWNLOADS_DISABLED_MESSAGE }, { status: 403 })
  }

  const member = await getCurrentMember()
  if (!member) {
    return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  }
  // Loaded once and reused for both checks below. Empty, without a query, for an
  // all-access member — which is everyone who has not bought a single section.
  const entitlements = await loadEntitlements(member)
  if (!hasAnyAccess(member, entitlements)) {
    return NextResponse.json({ error: 'Your membership is not active.' }, { status: 403 })
  }

  const report = await db.report.findUnique({ where: { id: params.id } })
  if (!report || (!report.published && member.role !== 'admin')) {
    return NextResponse.json({ error: 'Report not found.' }, { status: 404 })
  }
  if (!canReadReport(member, report, entitlements)) {
    return NextResponse.json(
      { error: 'This report is not part of your subscription.' },
      { status: 403 },
    )
  }
  if (!report.pdfBlobUrl) {
    return NextResponse.json({ error: 'This report has no downloadable file.' }, { status: 404 })
  }

  const { token, tokenId } = await mintReportToken(member.id, report.id, 'download')
  const { ipAddress, userAgent } = requestFingerprint()

  await db.reportView.create({
    data: {
      reportId: report.id,
      memberId: member.id,
      ipAddress,
      userAgent,
      signedTokenId: tokenId,
      downloaded: true,
    },
  })

  return NextResponse.json({
    url: `/api/reports/${report.id}/file?token=${encodeURIComponent(token)}`,
    expiresInSeconds: REPORT_TOKEN_TTL_SECONDS,
  })
}
