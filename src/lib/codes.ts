import { randomInt } from 'crypto'

/**
 * Redemption code alphabet.
 *
 * Deliberately excludes 0/O and 1/I/L — codes get read off a phone screen and typed
 * by hand, and those pairs are the usual source of "my code doesn't work" support.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

function block(length: number): string {
  let out = ''
  for (let i = 0; i < length; i += 1) out += ALPHABET[randomInt(ALPHABET.length)]
  return out
}

/** e.g. NSR-4KFP-9TQX */
export function generateRedemptionCode(): string {
  return `NSR-${block(4)}-${block(4)}`
}

/**
 * Default life of an access code.
 *
 * A code is a promise of a membership, not the membership itself — the paid period starts
 * at redemption, not at issue — so an unbounded code is an open-ended liability sitting in
 * an inbox. Fourteen days is long enough that nobody who bought one loses it to a holiday,
 * and short enough that a leaked or forwarded code stops working.
 *
 * It is a default, not a rule: a launch offer that runs for a quarter and a code handed to
 * one person in a meeting are not the same promise, so the operator sets the validity per
 * batch. This is only what they get if they do not choose.
 */
export const CODE_VALIDITY_DAYS = 14

/**
 * Longest validity the operator may set, in days.
 *
 * Generous rather than tight. This is not the guard against an accidentally immortal
 * code — "never expires" is a named choice for that, made deliberately — it is only a
 * bound that keeps a number field from accepting something meaningless. Ten years is far
 * past any real offer while still rejecting a stray paste.
 */
export const MAX_CODE_VALIDITY_DAYS = 3650

/**
 * When a code issued at `from` stops working.
 *
 * `days` of null means it never does. That is a real choice an operator can make and the
 * UI names it plainly, rather than something reachable by entering a very large number —
 * an unlimited code should be something you decided, not something you typed.
 */
export function codeExpiresAt(
  from: Date = new Date(),
  days: number | null = CODE_VALIDITY_DAYS,
): Date | null {
  if (days === null) return null

  const expires = new Date(from)
  expires.setDate(expires.getDate() + days)
  return expires
}

/**
 * Where a code's expiry moves to when an operator extends it by `days`.
 *
 * **The base is whichever is later, now or the current expiry** — never simply "now", and
 * never simply the old date. That single choice is what makes the action safe to click:
 *
 * - A code that lapsed three weeks ago and is extended by 7 days becomes usable for the
 *   next 7 days. Counting from the old expiry would hand back a code that is still dead,
 *   which is precisely the complaint the operator is answering.
 * - A code with 40 days left that is extended by 7 gets 47. Counting from now would take
 *   33 days away from a member — an *extend* action must never shorten anything.
 *
 * `days` of null clears the expiry entirely: the code works until it is used.
 */
export function extendedExpiry(
  current: Date | null,
  days: number | null,
  now: Date = new Date(),
): Date | null {
  if (days === null) return null

  const base =
    current !== null && current.getTime() > now.getTime() ? new Date(current) : new Date(now)
  base.setDate(base.getDate() + days)
  return base
}

/**
 * Expiry is read from the clock, never stored as a status.
 *
 * There is no job that sweeps codes into an `expired` state, because a code's validity is
 * a property of time rather than something the system has to remember to do. That also
 * means expiry can never be wrong through a missed cron run.
 *
 * A null `expiresAt` means no expiry: codes issued before validity existed keep working,
 * since retroactively killing a code already sitting in someone's inbox is worse than an
 * old code living on.
 */
export function isCodeExpired(
  code: { expiresAt: Date | null },
  now: Date = new Date(),
): boolean {
  return code.expiresAt !== null && code.expiresAt.getTime() <= now.getTime()
}

/** Accepts user input in any case/spacing and normalises it to canonical form. */
export function normaliseCode(input: string): string {
  const cleaned = input
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/^NSR/, '')
  if (cleaned.length !== 8) return input.trim().toUpperCase()
  return `NSR-${cleaned.slice(0, 4)}-${cleaned.slice(4, 8)}`
}
