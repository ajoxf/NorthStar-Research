import { NextResponse } from 'next/server'
import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { createReport } from '@/lib/report-create'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Create a report. Upload does not send anything — publishing does (see /publish). */
export async function POST(request: Request) {
  let admin
  try {
    admin = await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  // The checks themselves live in createReport, shared with an expert's own upload.
  const result = await createReport(await request.formData(), { kind: 'admin', memberId: admin.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, reportId: result.reportId, warning: result.warning })
}
