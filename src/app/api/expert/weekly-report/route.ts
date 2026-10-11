import { NextResponse } from 'next/server'

import { getCurrentMember } from '@/lib/auth'
import { authorWeekPdfFile, pdfResponse } from '@/lib/author-week'
import { authorForMember } from '@/lib/expert-account'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The expert's own weekly subscriber report — the one the desk can download for them. */
export async function GET() {
  const member = await getCurrentMember()
  if (!member) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

  const author = await authorForMember(member.id)
  if (!author) return NextResponse.json({ error: 'This account is not an expert.' }, { status: 403 })

  const file = await authorWeekPdfFile(author.id)
  if (!file) return NextResponse.json({ error: 'No such expert.' }, { status: 404 })
  return pdfResponse(file)
}
