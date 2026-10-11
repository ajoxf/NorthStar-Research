import 'server-only'

import { ProviderError } from '@/lib/payments/http'
import type { Connected } from '@/lib/payments/registry'

/**
 * Run a provider's connection test and say what happened in words for the admin.
 *
 * The provider's own error text is shown — "Invalid API Key provided" — because it is what
 * tells an admin which key is wrong. Nothing of ours is added to it, and a secret is never
 * in it: providers mask keys in their messages, and ours never include one.
 */
export async function runConnectionTest(connected: Connected): Promise<{ ok: boolean; message: string }> {
  const { gateway, cfg } = connected
  if (!gateway.testConnection) return { ok: true, message: `${gateway.name} has no connection test. Saved.` }
  const missing = gateway.fields.filter((field) => field.required && !cfg.values[field.key])
  if (missing.length) return { ok: false, message: `Still missing: ${missing.map((field) => field.label).join(', ')}.` }
  try {
    return { ok: true, message: await gateway.testConnection(cfg) }
  } catch (error) {
    const message =
      error instanceof ProviderError || error instanceof Error ? error.message : `${gateway.name} did not accept these keys.`
    return { ok: false, message: message.slice(0, 300) }
  }
}
