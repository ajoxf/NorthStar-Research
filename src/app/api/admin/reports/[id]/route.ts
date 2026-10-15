import { NextResponse } from 'next/server'
import { del } from '@vercel/blob'

import { db } from '@/lib/db'
import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { updateReport } from '@/lib/report-update'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Edit report metadata and content. The checks live in updateReport, shared with an
 * expert editing their own submission.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  let admin
  try {
    admin = await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const result = await updateReport(params.id, await request.json().catch(() => null), { kind: 'admin', memberId: admin.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, reportId: result.reportId })
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
