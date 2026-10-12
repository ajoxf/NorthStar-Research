import { NextResponse } from 'next/server'

import { getCurrentMember } from '@/lib/auth'
import { authorForMember } from '@/lib/expert-account'
import { notifySubmission } from '@/lib/expert-reports'
import { createReport } from '@/lib/report-create'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * An expert uploads a report for review. Saved as an unpublished draft in one of their own
 * sections; nothing reaches members until an admin publishes it. The expert is the one
 * linked to the signed-in member — never named in the body.
 */
export async function POST(request: Request) {
  const member = await getCurrentMember()
  if (!member) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  const author = await authorForMember(member.id)
  if (!author) return NextResponse.json({ error: 'This account is not an expert.' }, { status: 403 })

  const result = await createReport(await request.formData(), { kind: 'expert', memberId: member.id, authorId: author.id })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  await notifySubmission(result.reportId)
  return NextResponse.json({ ok: true, reportId: result.reportId, warning: result.warning })
}
