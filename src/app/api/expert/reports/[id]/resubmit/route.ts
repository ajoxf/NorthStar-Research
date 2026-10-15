import { NextResponse } from 'next/server'

import { getCurrentMember } from '@/lib/auth'
import { authorForMember } from '@/lib/expert-account'
import { resubmitSubmission } from '@/lib/expert-reports'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** An expert sends a corrected, sent-back report for review again. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const member = await getCurrentMember()
  if (!member) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  const author = await authorForMember(member.id)
  if (!author) return NextResponse.json({ error: 'This account is not an expert.' }, { status: 403 })

  const result = await resubmitSubmission(params.id, author.id, member.id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
