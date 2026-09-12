/**
 * When somebody may set a new password without knowing the old one.
 *
 * ## Why this exists
 *
 * This site had no password reset. Not a broken one — none at all: no reset route, no
 * reset email, and a change-password form that refused without the current password. The
 * email sign-in link stood in for it, badly, because it got you in and then left you
 * unable to change anything, so a member who forgot their password was on email links
 * forever and did not know why.
 *
 * ## The rule, and why it is safe
 *
 * A password change normally requires proving the current one, because a session could be
 * a hijacked one and taking somebody's account should not be a single click. Two cases
 * are different:
 *
 *   1. **There is no password to prove.** Signed in with Google and never set one. There
 *      is nothing to know, so demanding it locks them out of ever having a password — the
 *      form was refusing the only people it could not possibly protect.
 *
 *   2. **They just proved control of the email address.** An email sign-in link is
 *      delivered to the address on the account and expires in fifteen minutes. That is
 *      exactly the proof a password reset email provides, and it is the proof every reset
 *      flow on the internet is built on. Having accepted it as sufficient to sign in, it
 *      is inconsistent to treat it as insufficient to set a password.
 *
 * The second case is **time-boxed**, which is the part that matters. Sessions last thirty
 * days; the right to change a password without the old one lasts thirty minutes. A link
 * session left open on a shared machine for a fortnight is an ordinary session, not a
 * standing offer to take the account.
 */

/** How long after signing in by email link the reset window stays open. */
export const RESET_WINDOW_MINUTES = 30

export type SignInMethod = 'password' | 'link' | 'google'

export function canSetPasswordWithoutCurrent(input: {
  /** Does the account have a password at all? */
  hasPassword: boolean
  /** How this session began. */
  via: SignInMethod
  /** When it began, epoch seconds. */
  viaAt: number
  now?: Date
}): boolean {
  const { hasPassword, via, viaAt } = input
  if (!hasPassword) return true
  if (via !== 'link') return false

  const now = (input.now ?? new Date()).getTime()
  const startedAt = viaAt * 1000
  // A clock-skewed or absent timestamp must not read as "just now" and must not read as
  // an open window either. Anything not inside the window, in either direction, is closed.
  const elapsed = now - startedAt
  return elapsed >= 0 && elapsed <= RESET_WINDOW_MINUTES * 60 * 1000
}

/** What to tell somebody whose window has closed, or who signed in another way. */
export const NEEDS_CURRENT_PASSWORD =
  'Enter your current password. If you have forgotten it, sign in with an email link and you can set a new one.'
