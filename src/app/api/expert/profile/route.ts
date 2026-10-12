import { NextResponse } from 'next/server'

import { getCurrentMember } from '@/lib/auth'
import { authorForMember } from '@/lib/expert-account'
import { submitProfileDraft } from '@/lib/expert-profile'
import { authorInputSchema } from '@/lib/section-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Only what an expert may propose. Name, link, order and revenue share stay with the desk. */
const schema = authorInputSchema.pick({ headline: true, bio: true, photoUrl: true, websiteUrl: true, linkedinUrl: true, xUrl: true, credentials: true })

/**
 * An expert proposes changes to their own public profile. Saved for an admin to approve;
 * nothing public changes here. The expert is the one linked to the signed-in member.
 */
export async function PUT(request: Request) {
  const member = await getCurrentMember()
  if (!member) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })
  const author = await authorForMember(member.id)
  if (!author) return NextResponse.json({ error: 'This account is not an expert.' }, { status: 403 })

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check what you entered.' }, { status: 400 })
  }
  const f = parsed.data
  const result = await submitProfileDraft(
    author.id,
    {
      headline: f.headline ?? null,
      bio: f.bio ?? null,
      photoUrl: f.photoUrl ?? null,
      credentials: f.credentials,
      websiteUrl: f.websiteUrl ?? null,
      linkedinUrl: f.linkedinUrl ?? null,
      xUrl: f.xUrl ?? null,
    },
    member.id,
  )
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true, changed: result.changed })
}
