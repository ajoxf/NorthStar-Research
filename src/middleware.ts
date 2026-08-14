import { NextResponse, type NextRequest } from 'next/server'

import { ATTRIBUTION_DAYS, REFERRAL_COOKIE, normaliseSlug } from '@/lib/affiliates'

/**
 * Two pieces of plumbing that have to happen before a page renders.
 *
 * **Pathname header.** The admin layout needs to know which route it is rendering so it
 * can let /admin/login through while redirecting every other /admin/* route to it —
 * without this, signing out would bounce between the guard and the login page forever.
 * This is plumbing, not a security boundary: authorisation happens in the layout and
 * again in every admin route handler, against the database.
 *
 * **Referral attribution.** `?ref=slug` on any page drops a cookie, here rather than on
 * the page, because a server component cannot set one and an affiliate link that only
 * worked if the visitor landed on exactly the right route would quietly lose credit.
 * The cookie is only ever read to attribute a sale — it grants nothing.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set('x-pathname', request.nextUrl.pathname)

  const response = NextResponse.next({ request: { headers } })

  const ref = normaliseSlug(request.nextUrl.searchParams.get('ref') ?? '')
  if (ref) {
    response.cookies.set(REFERRAL_COOKIE, ref, {
      // Not httpOnly: the join page reads it to record the click. It is an attribution
      // hint, not a credential, and nothing is granted on the strength of it.
      httpOnly: false,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ATTRIBUTION_DAYS * 24 * 60 * 60,
    })
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
