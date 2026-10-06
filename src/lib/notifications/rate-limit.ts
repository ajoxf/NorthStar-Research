/**
 * Telling a refusal apart from a rejection.
 *
 * "Too many requests" means *ask again shortly*. "That mailbox does not exist" means *this
 * will never work*. Until this file existed the provider heard both as the same thing: any
 * error became `status: 'failed'` with the vendor's message, recorded permanently in the
 * delivery log, indistinguishable in the admin from a bad address.
 *
 * That is worse than it sounds, because a rate-limited send is a send that *would have*
 * worked. The member never gets the report, nothing retries by itself, and the only
 * evidence is a line in a log that reads like the address was wrong.
 */

/** Resend's own name for it, and the generic HTTP spelling. */
const RATE_LIMIT_NAMES = new Set(['rate_limit_exceeded', 'too_many_requests'])

/**
 * Match on words rather than on the status number.
 *
 * `429` is deliberately not matched in free text: provider messages carry ids and counts,
 * and a message that merely contains those digits is not a rate limit. The numeric check
 * below reads the status *field*, where the number means what it says.
 */
function readsAsRateLimit(text: string): boolean {
  return /too many requests|rate[ _-]?limit/i.test(text)
}

/**
 * Whether a provider error is a transient rate-limit refusal.
 *
 * Takes `unknown` because it is handed three different shapes: Resend's structured
 * `{ name, message }` error object, a thrown `Error` from the SDK or the fetch underneath
 * it, and — through `DeliveryResult.error` — a bare message string. Narrow and permissive
 * on purpose: the penalty for a false positive is a few wasted retries, and the penalty
 * for a false negative is an email that never arrives.
 */
export function isRateLimit(error: unknown): boolean {
  if (!error) return false
  if (typeof error === 'string') return readsAsRateLimit(error)
  if (typeof error !== 'object') return false

  const candidate = error as {
    name?: unknown
    message?: unknown
    code?: unknown
    status?: unknown
    statusCode?: unknown
  }

  for (const value of [candidate.statusCode, candidate.status, candidate.code]) {
    if (value === 429 || value === '429') return true
  }

  if (typeof candidate.name === 'string' && RATE_LIMIT_NAMES.has(candidate.name)) return true

  const text = [candidate.name, candidate.message, candidate.code]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
  return readsAsRateLimit(text)
}

/**
 * How long to hold off before attempt number `attempt` (1 is the first retry).
 *
 * Doubling from half a second: 500ms, 1s, 2s, 4s. The first wait is short because a
 * second-granularity limit usually clears within one second — a longer first wait would
 * turn a send that needed 500ms of patience into a minute of stalling. The doubling is
 * what covers the case where the account is busy for longer than that.
 */
export function backoffMs(attempt: number, baseMs = 500): number {
  const n = Math.max(1, Math.floor(attempt))
  return baseMs * 2 ** (n - 1)
}
