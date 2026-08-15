/**
 * Environment access with loud placeholder detection.
 *
 * Section 5.1 of the build spec is explicit: the Cregis credentials ship as
 * placeholders, and the code must fail *loudly and clearly* if it is ever invoked
 * with a placeholder still in place. A silent no-op would let someone believe the
 * payment integration works when it does not.
 */

export class MissingConfigError extends Error {
  readonly keys: string[]

  constructor(keys: string[], context: string) {
    super(
      `[NordStar] ${context} is not configured. The following environment variable(s) are ` +
        `missing or still set to a placeholder: ${keys.join(', ')}. ` +
        `Set real values in Vercel → Settings → Environment Variables (see .env.example).`,
    )
    this.name = 'MissingConfigError'
    this.keys = keys
  }
}

/** A value is a placeholder if it is empty or contains our REPLACE_ME marker. */
export function isPlaceholder(value: string | undefined | null): boolean {
  if (!value) return true
  return value.trim() === '' || value.toUpperCase().includes('REPLACE_ME')
}

/** Read a variable, throwing a descriptive error if it is absent or a placeholder. */
export function requireEnv(key: string, context: string): string {
  const value = process.env[key]
  if (isPlaceholder(value)) throw new MissingConfigError([key], context)
  return value as string
}

/** Read several variables at once so the error names *all* of them, not just the first. */
export function requireEnvAll(keys: string[], context: string): Record<string, string> {
  const missing = keys.filter((key) => isPlaceholder(process.env[key]))
  if (missing.length > 0) throw new MissingConfigError(missing, context)
  return Object.fromEntries(keys.map((key) => [key, process.env[key] as string]))
}

/** Non-throwing check, for rendering "not configured yet" states in the admin console. */
export function isConfigured(...keys: string[]): boolean {
  return keys.every((key) => !isPlaceholder(process.env[key]))
}

export function optionalEnv(key: string, fallback: string): string {
  const value = process.env[key]
  return isPlaceholder(value) ? fallback : (value as string)
}

/** The site's canonical origin. Used when APP_BASE_URL is unset — see below. */
export const CANONICAL_BASE_URL = 'https://nordstarpro.com'

/**
 * What to use when `APP_BASE_URL` is missing or still a placeholder.
 *
 * Previously this fell back to `http://localhost:3000` everywhere, which meant a variable
 * that was unset, misspelled or lost in a project migration failed *silently* in
 * production: emails would carry links to localhost and the Cregis callback URLs derived
 * from it would point nowhere. Payments are lost that way without anything erroring.
 *
 * Defaulting to the real origin in production makes the deployment correct even when the
 * dashboard is not. Setting `APP_BASE_URL` explicitly still wins, which is what makes
 * preview and staging environments work.
 */
export function defaultBaseUrl(nodeEnv: string | undefined): string {
  return nodeEnv === 'production' ? CANONICAL_BASE_URL : 'http://localhost:3000'
}

export const appBaseUrl = (): string =>
  optionalEnv('APP_BASE_URL', defaultBaseUrl(process.env.NODE_ENV)).replace(/\/$/, '')

/**
 * The single plan: $199 per month. There is exactly one price and no tiers.
 *
 * Card members (Stripe) renew automatically. Crypto members (Cregis) pay per period by
 * hand, because crypto payments are push-based — there is no stored mandate to charge
 * against, so nothing can auto-renew. Both settle to the same `subscriptionRenewsAt`
 * date, which is what actually gates access.
 */
export const PLAN = {
  priceUsd: 199,
  amount: '199.00',
  currency: 'USD',
  interval: 'month',
  name: 'NordStar Pro Membership',
  description: '3 research reports per week',
} as const

/** One billing period. Used to extend `subscriptionRenewsAt` on payment. */
export function addBillingPeriod(from: Date = new Date()): Date {
  const next = new Date(from)
  next.setMonth(next.getMonth() + 1)
  return next
}
