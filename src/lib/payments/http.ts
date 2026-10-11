import 'server-only'

/** A provider's API answered with an error. The message is the provider's own. */
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

/**
 * JSON to and from a provider, with a 20-second limit and no caching.
 *
 * A non-2xx answer throws with the provider's own error text — "Invalid API key" — because
 * that is what an admin testing their keys needs to read, and nothing of ours is in it.
 */
export async function callJson<T = unknown>(provider: string, url: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    })
  } catch (error) {
    const reason = error instanceof Error && error.name === 'TimeoutError' ? 'did not answer within 20 seconds' : 'could not be reached'
    throw new ProviderError(provider, `${provider} ${reason}.`)
  }
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!response.ok) {
    throw new ProviderError(provider, `${provider}: ${providerMessage(body) ?? `HTTP ${response.status}`}`, response.status)
  }
  return body as T
}

/** The error text a provider put in its body, wherever it put it. */
function providerMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  const nested = record.error
  if (typeof nested === 'string') return nested
  if (nested && typeof nested === 'object') {
    const inner = nested as Record<string, unknown>
    if (typeof inner.description === 'string') return inner.description
    if (typeof inner.message === 'string') return inner.message
  }
  for (const key of ['message', 'description', 'error_description', 'detail']) {
    if (typeof record[key] === 'string') return record[key] as string
  }
  const errors = record.errors
  if (Array.isArray(errors) && errors[0] && typeof errors[0] === 'object') {
    const first = errors[0] as Record<string, unknown>
    if (typeof first.description === 'string') return first.description
    if (typeof first.message === 'string') return first.message
  }
  return null
}

export function basicAuth(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`
}
