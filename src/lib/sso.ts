import 'server-only'

import { adminFetch, productAuthConfigured, productAuthItemSlug } from '@/lib/product-auth'

export * from '@/lib/sso-shape'

/**
 * Minting a real session in the product, from here.
 *
 * Two admin calls, both documented for exactly this:
 *
 *   1. `generate_link` produces a one-time sign-in token **without emailing anything** —
 *      "useful for custom admin functionality where you want to build the flow yourself".
 *   2. `verify` exchanges that token for a session, returning it in the response body
 *      because it is a POST made by a server rather than a link followed by a browser.
 *
 * The result is an ordinary Supabase session for the right user. That matters more than it
 * sounds: RAMP's row-level security keys off `auth.uid()`, so a genuine session means not
 * one policy, table or line of the application has to change to accommodate this.
 */

export type MintedSession = { access_token: string; refresh_token: string }

export function ssoConfigured(): boolean {
  return productAuthConfigured()
}

export function ssoItemSlug(): string {
  return productAuthItemSlug()
}

/**
 * A session for this email address, or null with the reason logged.
 *
 * Never throws. A failure here is a customer standing at a door that will not open, and
 * the honest response is to send them somewhere that explains itself rather than to show
 * them a stack trace.
 */
export async function mintProductSession(email: string): Promise<MintedSession | null> {
  const generated = await adminFetch('/generate_link', {
    method: 'POST',
    body: JSON.stringify({ type: 'magiclink', email }),
  })

  if (!generated.ok) {
    console.error('[sso] generate_link refused', { status: generated.status })
    return null
  }

  const hashed = (generated.body as { hashed_token?: string } | null)?.hashed_token
  if (!hashed) {
    console.error('[sso] generate_link returned no hashed_token')
    return null
  }

  /*
   * Exchanged on /auth/v1/verify, not under /admin — this half is the ordinary
   * verification endpoint, which is why the session comes back rather than a redirect.
   */
  const verified = await adminFetch('/verify', {
    method: 'POST',
    body: JSON.stringify({ type: 'magiclink', token_hash: hashed }),
    absolute: true,
  })

  if (!verified.ok) {
    console.error('[sso] verify refused', { status: verified.status })
    return null
  }

  const body = verified.body as Partial<MintedSession> | null
  if (!body?.access_token || !body?.refresh_token) {
    console.error('[sso] verify returned no session')
    return null
  }

  return { access_token: body.access_token, refresh_token: body.refresh_token }
}
