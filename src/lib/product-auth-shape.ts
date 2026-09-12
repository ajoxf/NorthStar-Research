/**
 * Connecting an entitlement here to an account in a product's own sign-in system.
 *
 * ## The problem
 *
 * Nexus RAMP authenticates with Supabase and knows nothing about this site. So a trial
 * or a code redeemed here granted a row in this database and nothing a person could
 * actually sign into — the entitlement was real and the door was still locked.
 *
 * ## What this does instead of a rewrite
 *
 * When the portal grants the product, it creates the account in the product's own system
 * with the email and the password the person just chose here. They then sign into RAMP
 * with the credentials they already have, and RAMP is not modified at all — no shared
 * session, no token exchange, no second sign-in page to maintain. When access lapses the
 * account there is disabled rather than deleted, so a renewal gives them their own data
 * back rather than an empty book.
 *
 * ## What it honestly is not
 *
 * It is one credential, not one session. Signing out of the portal does not sign anybody
 * out of RAMP, and a password changed anywhere other than this portal's account page —
 * in RAMP itself, say — is from then on that product's own. Both are worth knowing, and
 * neither is worth rebuilding a working platform's sign-in to avoid.
 *
 * This module has the decisions and imports nothing, so they can be tested. The calls go
 * out in product-auth.ts.
 */

/** Everything the decision below needs to know about the existing linked account. */
export type LinkedAccount = {
  externalId: string
  disabledAt: Date | null
  /** Set when the account predates the portal and was linked rather than created. */
  adoptedAt?: Date | null
} | null

export type SyncAction =
  /** No account there yet: create one with the password we were handed. */
  | 'create'
  /** There is one, disabled by a previous lapse: turn it back on. */
  | 'reactivate'
  /** Live already, and the person has just changed their password here. */
  | 'set_password'
  /** Access has ended: disable it there, keeping their data. */
  | 'disable'
  /** Nothing to do. */
  | 'none'
  /** Should be created, but nobody handed us a password to create it with. */
  | 'needs_password'
  /** They already had an account in the product; it was linked, password untouched. */
  | 'adopted'

/**
 * What should happen to the product account, given what the member holds right now.
 *
 * Driven by the entitlement, never by which route called it. A trial, a redeemed code
 * and a renewal all reach the same state, so they all get the same answer — and the one
 * case that matters most, access having ended, is reached by a job that knows nothing
 * about how the access was granted in the first place.
 */
export function syncAction(input: {
  holdsItem: boolean
  account: LinkedAccount
  /** Present when the caller has the person's plaintext password at hand. */
  password: string | null
}): SyncAction {
  const { holdsItem, account, password } = input

  if (!holdsItem) {
    // Never delete. A lapsed trialist who comes back a month later should find their
    // own fills where they left them, not an empty account.
    if (account && account.disabledAt === null) return 'disable'
    return 'none'
  }

  if (!account) return password ? 'create' : 'needs_password'
  if (account.disabledAt !== null) return 'reactivate'

  /*
   * An account that was already theirs keeps its own password.
   *
   * The portal never set it, so it has no standing to change it — and if it did, anyone
   * who knows an email address could take over that product account by starting a trial
   * on it. The two passwords being different is worth saying out loud to the person; it
   * is not worth fixing by overwriting theirs.
   */
  if (account.adoptedAt) return 'none'

  return password ? 'set_password' : 'none'
}

/**
 * Is the bridge configured at all?
 *
 * Both halves or neither. A URL without a key cannot call anything, and a key without a
 * URL has nowhere to send it; treating a half-configured deployment as "on" would mean
 * every grant appearing to fail rather than plainly not being connected yet.
 */
export function isConfigured(url: string | undefined, key: string | undefined): boolean {
  return Boolean(url && url.trim() && key && key.trim() && !key.startsWith('REPLACE_ME'))
}

/**
 * Does this error from the product's auth system mean the account already exists?
 *
 * Worth recognising rather than treating as a failure: it is what a member who already
 * signed up for RAMP directly looks like the first time the portal grants them anything.
 * The caller adopts the existing account instead of reporting an error nobody can act on.
 */
export function isAlreadyRegistered(status: number, body: unknown): boolean {
  if (status !== 422 && status !== 400 && status !== 409) return false
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? '')
  return /already[ _-]?(been )?registered|email[ _-]?exists|user[ _-]?already/i.test(text)
}

/** Emails are compared case-insensitively everywhere; store and send one spelling. */
export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase()
}
