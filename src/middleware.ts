import { NextResponse, type NextRequest } from 'next/server'

/**
 * Passes the current pathname through as a request header.
 *
 * The admin layout needs to know which route it is rendering so it can let
 * /admin/login through while redirecting every other /admin/* route to it — without
 * this, signing out would bounce between the guard and the login page forever.
 *
 * This is plumbing, not a security boundary: authorisation happens in the layout and
 * again in every admin route handler, against the database.
 */
export function middleware(request: NextRequest) {
  const headers = new Headers(request.headers)
  headers.set('x-pathname', request.nextUrl.pathname)
  return NextResponse.next({ request: { headers } })
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
