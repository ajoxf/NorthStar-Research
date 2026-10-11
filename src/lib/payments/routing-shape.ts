/**
 * Which providers a buyer is offered, from the rules an admin set. Pure, so the ranking is
 * tested without a database.
 */

export type RouteRule = {
  countryCode: string | null
  currency: string | null
  gateway: string
  priority: number
  isActive: boolean
}

/** With no rules at all: card, then crypto — what buyers saw before rules existed. */
export const DEFAULT_RULES: RouteRule[] = [
  { countryCode: null, currency: null, gateway: 'stripe', priority: 100, isActive: true },
  { countryCode: null, currency: null, gateway: 'cregis', priority: 110, isActive: true },
]

/**
 * The provider ids to offer, best first.
 *
 * Matching rules only, most specific first — country and currency (3), country (2),
 * currency (1), any (0) — then lowest priority. `usable` decides whether a provider can be
 * offered at all: known, not paused, has keys, and charges this currency. Each provider
 * appears once, at its best rule.
 */
export function rankProviders(
  rules: RouteRule[],
  country: string | null,
  currency: string,
  usable: (gateway: string) => boolean,
): string[] {
  const code = country?.toUpperCase() || null
  const money = currency.toUpperCase()
  const scored = rules
    .filter((rule) => rule.isActive)
    .filter((rule) => (!rule.countryCode || rule.countryCode === code) && (!rule.currency || rule.currency === money))
    .map((rule) => ({ rule, score: (rule.countryCode ? 2 : 0) + (rule.currency ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.rule.priority - b.rule.priority)

  const out: string[] = []
  for (const { rule } of scored) {
    if (out.includes(rule.gateway)) continue
    if (!usable(rule.gateway)) continue
    out.push(rule.gateway)
  }
  return out
}

/** Two letters, or null for any. Anything else is refused. */
export function normaliseCountry(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null
  const code = String(value).trim().toUpperCase()
  return /^[A-Z]{2}$/.test(code) ? code : undefined
}

/** Three letters, or null for any. Anything else is refused. */
export function normaliseCurrency(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null
  const code = String(value).trim().toUpperCase()
  return /^[A-Z]{3}$/.test(code) ? code : undefined
}
