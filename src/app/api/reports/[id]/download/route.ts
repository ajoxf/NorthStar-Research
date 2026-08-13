import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { getCurrentMember, hasActiveSubscription, requestFingerprint } from '@/lib/auth'
import { REPORT_TOKEN_TTL_SECONDS, mintReportToken } from '@/lib/report-access'

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
