/**
 * Signing somebody into Nexus RAMP from here.
 *
 * ## What this replaces
 *
 * Until now the portal created the RAMP account with the same password somebody chose
 * here, so they typed one set of credentials into two sign-in pages. That is shared
 * credentials, not one sign-in, and it showed: a RAMP-only account was refused by the
 * portal, a password changed in RAMP drifted from the one here, and signing out of one
 * left the other signed in.
 *
 * ## How this works instead
 *
 * The portal is the only place anybody signs in. Clicking through to RAMP hands it a real
 * Supabase session, minted here by the server that already holds the secret key: one
 * admin call generates a sign-in token without emailing it, a second exchanges that token
 * for a session. RAMP receives a genuine session for the right user, so its row-level
 * security — which keys off `auth.uid()` — keeps working exactly as it does today, and
 * nothing inside the application changes.
 *
 * ## Two properties worth stating plainly
 *
 *   - **A subscription is required, not just an account.** The handoff refuses anybody
 *     without a live entitlement to the product. Being signed into the portal is not
 *     access to RAMP, and it never becomes access by accident.
 *
 *   - **Revocation now bites.** The old arrangement left a working password behind until
 *     the nightly job disabled the account. Now the door is checked at every crossing,
 *     and the nightly disable additionally stops Supabase refreshing an open session — so
 *     a lapsed subscription closes within the hour rather than at the next sweep.
 *
 * This module holds the decisions and imports nothing. The calls out are in sso.ts.
 */

export type SsoRefusal =
  /** Not signed into the portal at all. */
  | 'signed_out'
  /** Signed in, but does not hold this product. */
  | 'not_entitled'
  /** Holds it, but the product's own account was never created — see product-auth. */
  | 'no_account'
  /** The bridge is not configured on this deployment. */
  | 'not_configured'

/**
 * May this person be handed a session for the product?
 *
 * Ordered so the answer somebody can act on wins. "You are not signed in" is useful;
 * "this deployment is misconfigured" is useful to an operator; being told you are not
 * entitled when in fact the bridge was never switched on would send a paying customer to
 * support over something they cannot fix.
 */
export function ssoRefusal(input: {
  configured: boolean
  signedIn: boolean
  entitled: boolean
  hasAccount: boolean
}): SsoRefusal | null {
  if (!input.signedIn) return 'signed_out'
  if (!input.configured) return 'not_configured'
  if (!input.entitled) return 'not_entitled'
  if (!input.hasAccount) return 'no_account'
  return null
}

/** Where a refused attempt lands, and what it says when it gets there. */
export function refusalDestination(refusal: SsoRefusal, returnTo: string): string {
  switch (refusal) {
    case 'signed_out':
      return `/login?next=${encodeURIComponent(returnTo)}`
    case 'not_entitled':
      // The dashboard is where somebody sees what they do hold, and where a trial is
      // offered. Better than an error page that tells them only what they lack.
      return '/dashboard?sso=not_entitled'
    case 'no_account':
      return '/dashboard?sso=setting_up'
    case 'not_configured':
      return '/dashboard?sso=unavailable'
  }
}

/**
 * The return trip: the product's URL carrying the session in the fragment.
 *
 * A fragment rather than a query string, and that is the whole point — fragments are not
 * sent to servers, so the tokens never reach an access log, a proxy, or a referrer
 * header. It is the same shape Supabase's own sign-in redirects use, which is why the
 * client library already recognises it and clears it from the address bar without the
 * application needing a line of new code.
 */
export function sessionRedirect(
  productUrl: string,
  session: { access_token: string; refresh_token: string },
): string {
  const base = productUrl.replace(/[#?].*$/, '').replace(/\/$/, '')
  const fragment = new URLSearchParams({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    token_type: 'bearer',
    type: 'magiclink',
  })
  return `${base}/#${fragment.toString()}`
}
