import { NextResponse } from 'next/server'
import { cookies, headers } from 'next/headers'
import { z } from 'zod'

import { CAMPAIGN_COOKIE, REFERRAL_COOKIE, normaliseCampaign, normaliseSlug } from '@/lib/affiliates'
import { db } from '@/lib/db'
import { countryCodeOf, referrerHostOf } from '@/lib/partner-report-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({ slug: z.string().max(64), referrer: z.string().max(2000).optional() })

/**
 * Record that somebody arrived through an affiliate link.
 *
 * Why a click is worth a row at all: without it the admin only ever sees conversions, and
 * a partner sending a thousand people who never buy looks identical to one sending
 * nobody. The difference is the whole reason to run an affiliate programme.
 *
 * Deliberately anonymous — no email, no member, no fingerprint. It is a tally, not a
 * tracker; the row gains an identity later only if that visitor actually signs up. What it
 * does keep is coarse: the referring site's host (never the page) and the country the edge
 * reports, so a partner can see which of their channels and markets work.
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
  // Applications not yet approved (or declined) count nothing either.
  if (!affiliate || (affiliate.status !== 'active' && affiliate.status !== 'paused')) return NextResponse.json({ ok: true })

  try {
    const campaign = normaliseCampaign(cookies().get(CAMPAIGN_COOKIE)?.value ?? '') || null
    const requestHeaders = headers()
    const referrerHost = referrerHostOf(parsed.data.referrer, requestHeaders.get('host'))
    const country = countryCodeOf(requestHeaders.get('x-vercel-ip-country'))
    await db.referral.create({ data: { affiliateId: affiliate.id, status: 'visited', campaign, referrerHost, country } })
  } catch (error) {
    // A dropped click is not worth failing a page load over.
    console.error('[referral] could not record visit', error)
  }

  return NextResponse.json({ ok: true })
}
