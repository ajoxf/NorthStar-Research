import { NextResponse } from 'next/server'

import { getCurrentMember } from '@/lib/auth'
import { authorForMember } from '@/lib/expert-account'
import { editableSubmission } from '@/lib/expert-reports'
import { updateReport } from '@/lib/report-update'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * An expert edits their own submission — the same fields and checks the desk's edit has,
 * while it is waiting for review or after it was sent back. Nothing here publishes.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const member = await getCurrentMember()
  if (!member) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  const author = await authorForMember(member.id)
  if (!author) return NextResponse.json({ error: 'This account is not an expert.' }, { status: 403 })

  if (!(await editableSubmission(params.id, author.id))) {
    return NextResponse.json({ error: 'This report can no longer be changed here.' }, { status: 409 })
  }
  const result = await updateReport(params.id, await request.json().catch(() => null), { kind: 'expert', memberId: member.id, authorId: author.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, reportId: result.reportId })
}
