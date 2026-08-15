import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { verifyReportToken } from '@/lib/report-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Stream a report PDF, authorised solely by a short-lived signed token.
 *
 * The Blob URL is never handed to the browser: Vercel Blob public URLs are permanent and
 * unguessable-but-shareable, which is precisely the "link that works for anyone who has
 * it" that requirement 10 rules out. Proxying through here means the only URL a member
 * ever holds is one that expires in minutes and is bound to their member id.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Missing access token.' }, { status: 401 })
  }

  const payload = await verifyReportToken(token)
  if (!payload || payload.reportId !== params.id) {
    return NextResponse.json({ error: 'This link has expired. Open the report again.' }, { status: 401 })
  }

  const [report, member] = await Promise.all([
    db.report.findUnique({ where: { id: params.id } }),
    db.member.findUnique({ where: { id: payload.memberId } }),
  ])

  // Re-check membership at fetch time: a token minted before a cancellation must not
  // outlive the subscription it was granted under.
  if (!member || (member.subscriptionStatus !== 'active' && member.role !== 'admin')) {
    return NextResponse.json({ error: 'Your membership is not active.' }, { status: 403 })
  }
  if (!report?.pdfBlobUrl) {
    return NextResponse.json({ error: 'Report file not found.' }, { status: 404 })
  }

  const upstream = await fetch(report.pdfBlobUrl, { cache: 'no-store' })
  if (!upstream.ok || !upstream.body) {
    console.error(`[reports] blob fetch failed for report ${report.id}: HTTP ${upstream.status}`)
    return NextResponse.json({ error: 'Report file could not be retrieved.' }, { status: 502 })
  }

  const filename = `${slugify(report.title)}.pdf`

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': 'application/pdf',
      // `attachment` for downloads; inline viewing happens through the in-app reader,
      // which avoids handing the browser's PDF toolbar (print/save) a document at all.
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'private, no-store, max-age=0',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  })
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'nordstarpro-report'
  )
}
