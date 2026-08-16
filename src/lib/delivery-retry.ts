/**
 * Whether a recorded delivery actually reached anybody.
 *
 * Split out from delivery.ts, which is server-only, so the rule can be tested directly.
 * It is worth testing: this predicate is what decides whether a member is skipped, and
 * getting it wrong in one direction spams people while the other silently denies them
 * the thing they paid for.
 *
 * ## The failure this exists to prevent
 *
 * The console provider logs a message and reports `sent`, so the delivery log and the
 * engagement views have data before any vendor account exists. Useful in development,
 * and actively harmful afterwards, because of what it collided with: the idempotency
 * check treated any non-failed row as delivered.
 *
 * So every report published before a real provider was configured left rows claiming
 * success — and once Resend was switched on, those rows *permanently suppressed* the
 * real send. The report could never reach those members, and each new publish reported
 * them as "skipped" rather than as a problem. It presented as "the emails were sent and
 * nobody got them", which is the worst kind of failure: every step reports success.
 *
 * A placeholder send is therefore not a delivery, and a real provider retries it.
 */

/** Providers that record a send without making one. */
export const PLACEHOLDER_PROVIDERS = new Set(['console'])

export function wasReallyDelivered(provider: string | null): boolean {
  // A null provider predates provider recording, so nothing proves it arrived. Retrying
  // risks a duplicate; not retrying risks silence — and a duplicate is recoverable.
  if (!provider) return false
  return !PLACEHOLDER_PROVIDERS.has(provider)
}
