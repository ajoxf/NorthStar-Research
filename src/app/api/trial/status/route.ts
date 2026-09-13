import { NextResponse } from 'next/server'

import { currentTrialOffer } from '@/lib/trial'

/**
 * Is a trial open, and what does it grant?
 *
 * Read-only, unauthenticated, and deliberately cross-origin: Nexus RAMP is a separate
 * application on its own domain, and it needs to know whether to offer a trial on its
 * sign-in screen.
 *
 * ## Why this exists rather than a link and a configuration flag
 *
 * RAMP first carried the offer behind a build-time variable. That put the truth in two
 * places: the portal decided whether trials were open, and somebody had to remember to
 * change a Vercel variable to match. The failure is silent and one-directional — close
 * trials here, forget the variable there, and RAMP keeps advertising an offer that this
 * site will refuse. Asking is cheap and cannot drift.
 *
 * ## What it discloses
 *
 * Whether an offer is open, how long it runs, and the name and slug of the item it grants.
 * All of it is already on the public /trial page, which is why the response is safe to
 * hand to any origin. Nothing about members, entitlements or money is reachable here, and
 * no cookie is read — the answer is the same for everybody.
 *
 * The SLUG is the part that matters to a caller. The trial grants exactly one item, and an
 * operator can point it at a research section instead of the platform. RAMP checks the
 * slug before it says a word, so "start a 14-day free trial" can never appear on the
 * platform's sign-in screen while the trial in fact hands over research.
 */
export const dynamic = 'force-dynamic'

/* No credentials are accepted and nothing here varies by caller, so a wildcard costs
   nothing and survives RAMP moving to its own domain, which an origin allowlist would
   not. */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'public, max-age=60, s-maxage=60',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET() {
  const offer = await currentTrialOffer()

  if (!offer.open) {
    return NextResponse.json({ open: false as const }, { headers: CORS })
  }

  return NextResponse.json(
    {
      open: true as const,
      days: offer.days,
      slug: offer.slug,
      name: offer.name,
      url: 'https://nordstarpro.com/trial',
    },
    { headers: CORS },
  )
}
