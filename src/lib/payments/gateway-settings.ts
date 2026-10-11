import 'server-only'

import { db } from '@/lib/db'
import { isPlaceholder } from '@/lib/env'
import { decryptSetting, encryptSetting } from '@/lib/settings-crypto'
import type { CredentialField, GatewayConfig, PaymentGateway } from '@/lib/payments/gateway-types'

/**
 * Providers' keys as admins enter them on the Providers page.
 *
 * Stored in AppSetting, one row per field, encrypted with AES-256-GCM before the value
 * reaches the database — the same storage and cipher Cregis's console-entered keys have
 * always used (see secure-settings.ts for what that protects against and what it cannot).
 * Only the server reads that table; nothing in a browser can.
 *
 * **Secrets are write-only.** A saved secret is never sent back to a page: the page is
 * told the last four characters, and a blank secret input on save keeps what is stored.
 * Non-secret fields — a key id, sandbox or live — are shown as saved.
 *
 * Every field falls back to its environment variable when nothing is saved, so a
 * deployment configured in Vercel keeps working, and saving a value here overrides it.
 */

export const MAX_FIELD_LENGTH = 4000

export function storageKey(gatewayId: string, field: CredentialField): string {
  return field.storageKey ?? `gateway.${gatewayId}.${field.key}`
}

function pausedKey(gatewayId: string): string {
  return `gateway.${gatewayId}.paused`
}

export type StoredGateway = {
  /** Decrypted values saved here, by field key. Server-side only — never sent to a page. */
  saved: Record<string, string>
  /** Fields with a saved row that no longer decrypts: AUTH_SECRET changed since it was saved. */
  unreadable: string[]
  paused: boolean
  updatedAt: Date | null
}

/** Several providers' stored keys in one read. */
export async function loadStored(gateways: PaymentGateway[]): Promise<Map<string, StoredGateway>> {
  const keys = gateways.flatMap((gateway) => [
    ...gateway.fields.map((field) => storageKey(gateway.id, field)),
    pausedKey(gateway.id),
  ])
  const rows = keys.length ? await db.appSetting.findMany({ where: { key: { in: keys } } }) : []
  const byKey = new Map(rows.map((row) => [row.key, row]))

  const out = new Map<string, StoredGateway>()
  for (const gateway of gateways) {
    const stored: StoredGateway = { saved: {}, unreadable: [], paused: false, updatedAt: null }
    for (const field of gateway.fields) {
      const row = byKey.get(storageKey(gateway.id, field))
      if (!row) continue
      const value = decryptSetting(row.value)
      if (value === null) stored.unreadable.push(field.key)
      else if (value.trim() !== '') stored.saved[field.key] = value
      if (!stored.updatedAt || row.updatedAt > stored.updatedAt) stored.updatedAt = row.updatedAt
    }
    const paused = byKey.get(pausedKey(gateway.id))
    stored.paused = paused ? decryptSetting(paused.value) === 'true' : false
    out.set(gateway.id, stored)
  }
  return out
}

function fromEnv(field: CredentialField): string | null {
  if (!field.env) return null
  const value = process.env[field.env]
  return value && !isPlaceholder(value) ? value.trim() : null
}

/** The keys a provider runs on: saved here first, then its environment variables. */
export function configFrom(gateway: PaymentGateway, stored: StoredGateway | undefined): GatewayConfig {
  const values: Record<string, string> = {}
  for (const field of gateway.fields) {
    const value = stored?.saved[field.key] ?? fromEnv(field)
    if (value) values[field.key] = value
  }
  return { values, enabled: !stored?.paused }
}

export type FieldState = {
  source: 'saved' | 'env' | null
  /** Secret: "••••4f2a". Not secret: the saved value itself. Null when nothing is saved. */
  shown: string | null
  unreadable: boolean
}

/** What the admin page may show about each field. Never a secret's value. */
export function fieldStates(gateway: PaymentGateway, stored: StoredGateway | undefined): Record<string, FieldState> {
  const out: Record<string, FieldState> = {}
  for (const field of gateway.fields) {
    const saved = stored?.saved[field.key]
    out[field.key] = {
      source: saved ? 'saved' : fromEnv(field) ? 'env' : null,
      shown: saved ? (field.secret ? `••••${saved.slice(-4)}` : saved) : null,
      unreadable: stored?.unreadable.includes(field.key) ?? false,
    }
  }
  return out
}

/**
 * Check what an admin typed, before anything is written. Returns the values to store per
 * field — null to remove one — or the first problem, in words for the form.
 */
export function validateKeys(
  gateway: PaymentGateway,
  input: Record<string, unknown>,
): { ok: true; writes: Record<string, string | null> } | { ok: false; error: string } {
  const writes: Record<string, string | null> = {}
  for (const field of gateway.fields) {
    if (!(field.key in input)) continue
    const raw = input[field.key]
    if (raw !== null && typeof raw !== 'string') return { ok: false, error: `${field.label} must be text.` }
    const value = (raw ?? '').trim()
    if (value.length > MAX_FIELD_LENGTH) return { ok: false, error: `${field.label} is too long.` }
    if (value && field.options && !field.options.includes(value)) {
      return { ok: false, error: `${field.label} must be one of: ${field.options.join(', ')}.` }
    }
    // A blank secret keeps what is saved; a blank plain field clears it.
    if (!value && field.secret) continue
    writes[field.key] = value || null
  }
  return { ok: true, writes }
}

/** Write validated keys. Returns the names of the fields written — never their values. */
export async function saveKeys(
  gateway: PaymentGateway,
  writes: Record<string, string | null>,
  adminId: string,
): Promise<string[]> {
  const changed: string[] = []
  for (const field of gateway.fields) {
    if (!(field.key in writes)) continue
    const key = storageKey(gateway.id, field)
    const value = writes[field.key]
    if (value === null) {
      await db.appSetting.deleteMany({ where: { key } })
    } else {
      const encrypted = encryptSetting(value)
      await db.appSetting.upsert({
        where: { key },
        create: { key, value: encrypted, updatedByAdminId: adminId },
        update: { value: encrypted, updatedByAdminId: adminId },
      })
    }
    changed.push(field.key)
  }
  return changed
}

/** Remove every saved key for a provider. Its environment variables, if any, take over. */
export async function removeKeys(gateway: PaymentGateway): Promise<string[]> {
  const keys = gateway.fields.map((field) => storageKey(gateway.id, field))
  const existing = await db.appSetting.findMany({ where: { key: { in: keys } }, select: { key: true } })
  await db.appSetting.deleteMany({ where: { key: { in: keys } } })
  return gateway.fields.filter((field) => existing.some((row) => row.key === storageKey(gateway.id, field))).map((f) => f.key)
}

export async function setPaused(gatewayId: string, paused: boolean, adminId: string): Promise<void> {
  const key = pausedKey(gatewayId)
  if (!paused) {
    await db.appSetting.deleteMany({ where: { key } })
    return
  }
  const value = encryptSetting('true')
  await db.appSetting.upsert({
    where: { key },
    create: { key, value, updatedByAdminId: adminId },
    update: { value, updatedByAdminId: adminId },
  })
}

/** Remove everything stored for a provider that is being deleted: keys and the pause flag. */
export async function forgetGateway(gateway: PaymentGateway): Promise<void> {
  await removeKeys(gateway)
  await db.appSetting.deleteMany({ where: { key: pausedKey(gateway.id) } })
}
