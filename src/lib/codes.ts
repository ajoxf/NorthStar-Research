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
 * How long an access code stays usable.
 *
 * A code is a promise of a membership, not the membership itself — the paid period starts
 * at redemption, not at issue — so an unbounded code is an open-ended liability sitting in
 * an inbox. Fourteen days is long enough that nobody who bought one loses it to a holiday,
 * and short enough that a leaked or forwarded code stops working.
 */
export const CODE_VALIDITY_DAYS = 14

/** When a code issued now stops working. */
export function codeExpiresAt(from: Date = new Date()): Date {
  const expires = new Date(from)
  expires.setDate(expires.getDate() + CODE_VALIDITY_DAYS)
  return expires
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
