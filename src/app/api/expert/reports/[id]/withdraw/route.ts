import { NextResponse } from 'next/server'

import { getCurrentMember } from '@/lib/auth'
import { authorForMember } from '@/lib/expert-account'
import { withdrawSubmission } from '@/lib/expert-reports'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** An expert takes back one of their own submissions before it is reviewed. */
export async function POST(_request: Request, { params }: { params: { id: string } }) {
  const member = await getCurrentMember()
  if (!member) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  const author = await authorForMember(member.id)
  if (!author) return NextResponse.json({ error: 'This account is not an expert.' }, { status: 403 })

  const result = await withdrawSubmission(params.id, author.id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
