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
      `[NorthStar] ${context} is not configured. The following environment variable(s) are ` +
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

export const appBaseUrl = (): string =>
  optionalEnv('APP_BASE_URL', 'http://localhost:3000').replace(/\/$/, '')

/** The single plan. There is exactly one price and it is not configurable. */
export const PLAN = {
  priceUsd: 249,
  amount: '249.00',
  currency: 'USD',
  name: 'NorthStar Research Membership',
  description: '3 research reports per week',
} as const
