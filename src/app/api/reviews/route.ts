import { NextResponse } from 'next/server'
import { z } from 'zod'

import { getCurrentMember } from '@/lib/auth'
import { REVIEW_BODY_MAX } from '@/lib/review-shape'
import { submitReview } from '@/lib/reviews'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  sectionId: z.string().min(1).max(64),
  rating: z.number().int(),
  body: z.string().max(REVIEW_BODY_MAX).optional(),
})

/**
 * A signed-in member rates and reviews a section. Nothing is shown until an admin approves
 * it; the reviewer is always the signed-in member, never taken from the body.
 */
export async function POST(request: Request) {
  const member = await getCurrentMember()
  if (!member) return NextResponse.json({ error: 'Sign in to write a review.' }, { status: 401 })
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Choose between 1 and 5 stars.' }, { status: 400 })
  const result = await submitReview(member.id, parsed.data)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}
