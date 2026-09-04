/**
 * Who gets warned that their access code is about to stop working, and who cannot be.
 *
 * A code is a promise of a membership that somebody has not collected yet. It lapsing is
 * not a disaster — nothing is deleted and the desk can extend it — but it is a silent
 * failure: the holder finds out by typing a code that no longer works, days after the
 * moment they were willing to act.
 *
 * The warning goes out **before** the expiry, never after. A notice that a code has
 * already died is only useful to somebody who already knew they had one, and by then the
 * only remaining action is to email the desk — which is the thing they were going to do
 * anyway.
 *
 * This module is the single source of truth for that decision. The cron sends from it and
 * the admin console counts from it, so "will be warned" on screen and "was warned" in the
 * inbox cannot drift apart.
 */

/**
 * How much notice we give.
 *
 * Three days, matching the crypto renewal reminder — long enough to act over a weekend,
 * short enough that the mail still reads as urgent rather than as an announcement about
 * something a fortnight away.
 */
export const EXPIRY_WARNING_DAYS = 3

/** The far edge of the warning window: codes expiring at or before this are due. */
export function expiryWarningCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() + EXPIRY_WARNING_DAYS * 86_400_000)
}

/**
 * Whole days left, rounded up, floored at zero.
 *
 * Rounded up, matching the renewal reminder, so any code with time left on it reads as at
 * least one day rather than as zero — the cutoff above never selects a code that has
 * already lapsed, so "0 days remaining" is a sentence this mail should never contain.
 */
export function daysUntilExpiry(expiresAt: Date, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000))
}

/**
 * The codes a warning run will consider, as a Prisma `where`.
 *
 * Exported so the cron that sends and the admin console that counts select from exactly
 * the same set. Two hand-written queries would drift the first time the window changed,
 * and a screen that says "4 expiring" while the job mails 6 is worse than no screen.
 *
 * Note what it does *not* filter on: `email`. Codes with nowhere to send are inside this
 * set on purpose, so they can be counted and shown rather than disappearing between the
 * query and the loop.
 */
export function expiringSoonWhere(now: Date = new Date()) {
  return {
    status: 'unused' as const,
    expiresAt: { gt: now, lte: expiryWarningCutoff(now) },
    expiryReminderSentAt: null,
  }
}

export type CodeForWarning = {
  status: string
  /** The address the code was issued to. Null on gifted codes — see `no_address`. */
  email: string | null
  expiresAt: Date | null
  expiryReminderSentAt: Date | null
}

export type WarningVerdict =
  /** Send it. */
  | 'due'
  /**
   * Due, but there is nowhere to send it.
   *
   * Gifted codes are the whole of this group: `email` is only populated when checkout
   * captured an address, and a comp handed out in a meeting deliberately carries an
   * operator's note there instead. These are counted and shown in the admin console
   * rather than skipped quietly — they are the codes most likely to be forgotten, so a
   * reminder system that drops them without saying so would be worse than none.
   */
  | 'no_address'
  /** Already warned for this expiry date. Extending the code clears the flag. */
  | 'already_warned'
  /** Redeemed, or never expires — nothing to warn about. */
  | 'not_applicable'
  /** Outside the window, in either direction. Past expiry is deliberate: see the note. */
  | 'not_due'

export function warningVerdict(code: CodeForWarning, now: Date = new Date()): WarningVerdict {
  if (code.status !== 'unused' || code.expiresAt === null) return 'not_applicable'

  // Strictly after `now`: a code that has already lapsed is never warned about. The mail
  // would arrive saying "this stopped working", which tells the holder nothing they will
  // not discover the moment they try it, and invites them to act on a code that cannot be
  // acted on.
  if (code.expiresAt.getTime() <= now.getTime()) return 'not_due'
  if (code.expiresAt.getTime() > expiryWarningCutoff(now).getTime()) return 'not_due'

  if (code.expiryReminderSentAt !== null) return 'already_warned'
  if (!code.email) return 'no_address'
  return 'due'
}
