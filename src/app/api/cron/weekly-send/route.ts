import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { deliverReportToActiveMembers } from '@/lib/delivery'
import { isPlaceholder } from '@/lib/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Scheduled delivery (build spec §5.6). Wired to Vercel Cron in vercel.json.
 *
 * The job publishes any report whose publish date has arrived but which an admin has not
 * pushed out manually, then delivers it. Publishing from the console and this cron run
 * are the same code path, and delivery is idempotent per member per report, so a report
 * an admin already sent is simply skipped here — the two cannot double-send.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const authorization = request.headers.get('authorization')

  // Without a configured secret this endpoint would be an open "email my whole list"
  // button, so refuse to run rather than defaulting to allow.
  if (isPlaceholder(secret)) {
    console.error('[cron] CRON_SECRET is not configured — refusing to run the weekly send.')
    return NextResponse.json({ error: 'cron secret not configured' }, { status: 503 })
  }
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const due = await db.report.findMany({
    where: { published: false, publishDate: { lte: new Date() } },
    orderBy: { publishDate: 'asc' },
  })

  const results = []

  for (const report of due) {
    const published = await db.report.update({
      where: { id: report.id },
      data: { published: true, publishedAt: new Date() },
    })

    const summary = await deliverReportToActiveMembers(published)
    results.push(summary)
    console.info(
      `[cron] published "${published.title}" — ${summary.sent} sent, ${summary.failed} failed, ${summary.skipped} skipped`,
    )
  }

  return NextResponse.json({ ok: true, publishedCount: results.length, results })
}
