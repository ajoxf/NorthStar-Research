import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { z } from 'zod'

import { REFERRAL_COOKIE, normaliseSlug } from '@/lib/affiliates'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ slug: z.string().max(64) })

/**
 * Record that somebody arrived through an affiliate link.
 *
 * Why a click is worth a row at all: without it the admin only ever sees conversions, and
 * a partner sending a thousand people who never buy looks identical to one sending
 * nobody. The difference is the whole reason to run an affiliate programme.
 *
 * Deliberately anonymous — no email, no member, no fingerprint. It is a tally, not a
 * tracker; the row gains an identity later only if that visitor actually signs up.
 *
 * Always answers `ok`, even for a slug that matches nothing. An endpoint that said
 * "no such affiliate" would let anyone enumerate the programme's partners.
 */
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ ok: true })

  const slug = normaliseSlug(parsed.data.slug)
  if (!slug) return NextResponse.json({ ok: true })

  // The cookie must agree with the body. Without this check the endpoint is a free
  // click-inflator for anybody with curl.
  if (cookies().get(REFERRAL_COOKIE)?.value !== slug) {
    return NextResponse.json({ ok: true })
  }

  const affiliate = await db.affiliate.findUnique({ where: { slug } })
  // A paused affiliate's existing links keep working for the people who already have
  // them, but stop accruing anything new. A closed one attributes nothing at all.
  if (!affiliate || affiliate.status === 'closed') return NextResponse.json({ ok: true })

  try {
    await db.referral.create({ data: { affiliateId: affiliate.id, status: 'visited' } })
  } catch (error) {
    // A dropped click is not worth failing a page load over.
    console.error('[referral] could not record visit', error)
  }

  return NextResponse.json({ ok: true })
}
