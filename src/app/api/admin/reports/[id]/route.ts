import { NextResponse } from 'next/server'
import { z } from 'zod'

import { del } from '@vercel/blob'

import { db } from '@/lib/db'
import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { sanitiseReportHtml } from '@/lib/pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  summary: z.string().trim().max(600).nullable().optional(),
  shareHook: z.string().trim().max(200).nullable().optional(),
  publishDate: z.string().optional(),
  htmlContent: z.string().nullable().optional(),
  instruments: z.string().optional(),
})

/**
 * Edit report metadata and content.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the values you entered.' },
      { status: 400 },
    )
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.title !== undefined) data.title = parsed.data.title
  if (parsed.data.summary !== undefined) data.summary = parsed.data.summary || null
  if (parsed.data.shareHook !== undefined) data.shareHook = parsed.data.shareHook || null
  if (parsed.data.htmlContent !== undefined) {
    data.htmlContent = parsed.data.htmlContent ? sanitiseReportHtml(parsed.data.htmlContent) : null
  }

  if (parsed.data.publishDate) {
    const publishDate = new Date(parsed.data.publishDate)
    if (Number.isNaN(publishDate.getTime())) {
      return NextResponse.json({ error: 'Enter a valid publish date.' }, { status: 400 })
    }
    data.publishDate = publishDate
  }

  if (parsed.data.instruments !== undefined) {
    if (parsed.data.instruments.trim() === '') {
      data.instruments = null
    } else {
      try {
        data.instruments = JSON.parse(parsed.data.instruments)
      } catch {
        return NextResponse.json({ error: 'The instrument data is not valid JSON.' }, { status: 400 })
      }
    }
  }

  const report = await db.report.update({ where: { id: params.id }, data })
  return NextResponse.json({ ok: true, reportId: report.id })
}

/**
 * Delete a report — but only one that never reached anybody.
 *
 * This exists for the case people actually want delete for: the wrong file was uploaded,
 * or a draft was created by mistake, and it should stop cluttering the list. It is not a
 * way to retract something members have already read.
 *
 * The rule is drawn at evidence of reach, not at the `published` flag:
 *
 *   - No views, no deliveries → nothing happened to it, so it goes, and its PDF goes with
 *     it rather than being orphaned in blob storage at cost.
 *   - Anyone viewed it, or a delivery was attempted → refused, with a pointer to
 *     un-publishing. A ReportView is the audit trail that makes a leak traceable, and a
 *     DeliveryLog is the record that somebody was emailed. Deleting the report would take
 *     both with it, and those records are the reason they exist.
 *
 * That second case is also a hard constraint, not only a policy one: ReportView and
 * DeliveryLog hold required foreign keys to Report with no cascade, so the database would
 * refuse the delete anyway. Better to say why in words than to surface a constraint error.
 */
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const report = await db.report.findUnique({
    where: { id: params.id },
    include: { _count: { select: { views: true, deliveryLogs: true } } },
  })
  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 })

  const { views, deliveryLogs } = report._count
  if (views > 0 || deliveryLogs > 0) {
    const seen = [
      views > 0 ? `${views} view${views === 1 ? '' : 's'}` : null,
      deliveryLogs > 0 ? `${deliveryLogs} delivery attempt${deliveryLogs === 1 ? '' : 's'}` : null,
    ]
      .filter(Boolean)
      .join(' and ')

    return NextResponse.json(
      {
        error:
          `This report has ${seen} against it, so it cannot be deleted — those records are ` +
          `the audit trail. Un-publish it instead: members lose access immediately and ` +
          `nothing is lost.`,
      },
      { status: 409 },
    )
  }

  // Remove the PDF first. If this fails the report stays, which is the recoverable order:
  // a stored file with no report is invisible and bills forever, while a report whose
  // file failed to delete can simply be deleted again.
  if (report.pdfBlobUrl) {
    try {
      await del(report.pdfBlobUrl)
    } catch (error) {
      console.error(`[admin:reports] blob delete failed for ${report.id}`, error)
      return NextResponse.json(
        { error: 'The report file could not be removed. Nothing was deleted — try again.' },
        { status: 502 },
      )
    }
  }

  await db.report.delete({ where: { id: report.id } })
  console.info(`[admin:reports] deleted unseen report ${report.id} ("${report.title}")`)

  return NextResponse.json({ ok: true })
}
