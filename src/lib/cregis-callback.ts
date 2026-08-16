/**
 * Deciding whether an inbound Cregis callback may be actioned, on its source address.
 *
 * Kept apart from cregis-settings.ts, which reaches the database, so this logic can be
 * unit-tested directly — it sits in front of the one route that grants paid access, and a
 * mistake here either lets a stranger in or rejects a real payment.
 */

/** Comma, space or newline separated. Operators paste these from a dashboard. */
export function parseIpList(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

/**
 * Is this address allowed to deliver a Cregis callback?
 *
 * An empty allowlist permits everything, which is the default and is not a hole: the
 * callback is already authenticated by an MD5 signature over the payload using the API
 * key, and that is what actually grants a membership. The allowlist is defence in depth
 * for operators whose processor publishes fixed egress addresses.
 *
 * Note the codebase's own warning in cregis.ts: Cregis has historically called from a
 * rotating pool. Filling this in with an incomplete list will silently reject real
 * payments, which is why it is off unless deliberately set.
 */
export function callbackIpAllowed(allowlist: string[], address: string | null): boolean {
  if (allowlist.length === 0) return true
  if (!address) return false
  return allowlist.includes(address.trim())
}

/**
 * The client address for an inbound request.
 *
 * `x-forwarded-for` is a list; the client is the first entry. It is trustworthy here only
 * because Vercel's edge rewrites the header — behind an arbitrary proxy it would be
 * attacker-controlled and this check would be worthless.
 */
export function clientAddress(headers: Headers): string | null {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null
  return headers.get('x-real-ip')
}
