import 'server-only'

import { isPlaceholder } from '@/lib/env'
import { parseIpList } from '@/lib/cregis-callback'
import { readSettings } from '@/lib/secure-settings'

/**
 * The Cregis configuration, resolved from the console first and the environment second.
 *
 * **The console wins.** That is the opposite of the usual precedence and it is deliberate:
 * the reason for editing these in the console is to change them without a redeploy, and a
 * value entered by hand that was then silently ignored because Vercel still held an old
 * one would be worse than not offering the field at all. The settings page states which
 * source is in effect for every value, and clearing a field falls back to the environment.
 *
 * Only Cregis is editable this way. Stripe's key can move money out of the account, so it
 * stays in the environment where only a deployment can change it. Cregis is deposit-only
 * on this account, which is what makes the trade acceptable — see the note in
 * src/lib/secure-settings.ts.
 */

export const CREGIS_SETTING_KEYS = {
  projectId: 'cregis.projectId',
  apiKey: 'cregis.apiKey',
  baseUrl: 'cregis.baseUrl',
  callbackIps: 'cregis.callbackIps',
} as const

export type CregisSource = 'console' | 'environment' | 'unset'

export type ResolvedCregisSettings = {
  projectId: { value: string | null; source: CregisSource }
  apiKey: { value: string | null; source: CregisSource }
  baseUrl: { value: string | null; source: CregisSource }
  /** Optional allowlist of source addresses permitted to POST the callback. */
  callbackIps: { value: string[]; source: CregisSource }
}

function pick(consoleValue: string | null, envKey: string): { value: string | null; source: CregisSource } {
  if (consoleValue) return { value: consoleValue, source: 'console' }
  const fromEnv = process.env[envKey]
  if (fromEnv && !isPlaceholder(fromEnv)) return { value: fromEnv, source: 'environment' }
  return { value: null, source: 'unset' }
}

export async function resolveCregisSettings(): Promise<ResolvedCregisSettings> {
  const stored = await readSettings(Object.values(CREGIS_SETTING_KEYS))

  const ips = stored[CREGIS_SETTING_KEYS.callbackIps]

  return {
    projectId: pick(stored[CREGIS_SETTING_KEYS.projectId], 'CREGIS_PROJECT_ID'),
    apiKey: pick(stored[CREGIS_SETTING_KEYS.apiKey], 'CREGIS_API_KEY'),
    baseUrl: pick(stored[CREGIS_SETTING_KEYS.baseUrl], 'CREGIS_BASE_URL'),
    callbackIps: ips
      ? { value: parseIpList(ips), source: 'console' }
      : { value: [], source: 'unset' },
  }
}

export { callbackIpAllowed, clientAddress, parseIpList } from '@/lib/cregis-callback'
