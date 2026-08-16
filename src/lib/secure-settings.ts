import 'server-only'

import { db } from '@/lib/db'
import { decryptSetting, encryptSetting } from '@/lib/settings-crypto'

/**
 * Settings an operator can change from the admin console, stored encrypted.
 *
 * ## What this protects against, and what it does not
 *
 * Values are encrypted with AES-256-GCM under a key derived from `AUTH_SECRET`, which
 * lives in the environment and never in the database. So a leaked database — a dump, a
 * backup on someone's laptop, a read-only analytics connection, a support engineer with
 * SQL access — yields ciphertext and nothing else.
 *
 * It does **not** protect against an attacker who already has code execution on the
 * server, because at that point they have `AUTH_SECRET` too. Nothing stored by an
 * application it can itself read is safe from that, and claiming otherwise would be
 * dishonest. The threat this addresses is credential exposure through the database,
 * which is the realistic one.
 *
 * ## Why this exists at all
 *
 * Payment credentials normally belong in the environment, and Stripe's still do — a
 * Stripe secret key can move money out, so it stays where only a deployment can change
 * it. The Cregis credentials are different by the owner's assessment: that account is
 * deposit-only, so the worst an exposed key permits is receiving money. Given that, being
 * able to rotate them from the console without a redeploy is worth more than the marginal
 * secrecy of an environment variable.
 *
 * That asymmetry is the whole design. It is not "the admin console can edit credentials";
 * it is "this specific, deposit-only credential is editable, and the one that can move
 * money is not".
 *
 * ## Rotating AUTH_SECRET
 *
 * Changing `AUTH_SECRET` makes every stored value undecryptable, exactly as it
 * invalidates every session. Decryption failures are reported as "not set" rather than
 * throwing, so the app falls back to the environment and keeps working — but the values
 * must then be re-entered. This is called out on the settings page.
 */

export { decryptSetting, encryptSetting }

export async function readSetting(key: string): Promise<string | null> {
  const row = await db.appSetting.findUnique({ where: { key } })
  if (!row) return null
  const value = decryptSetting(row.value)
  return value && value.trim() !== '' ? value : null
}

export async function readSettings(keys: string[]): Promise<Record<string, string | null>> {
  const rows = await db.appSetting.findMany({ where: { key: { in: keys } } })
  const found = new Map(rows.map((row) => [row.key, decryptSetting(row.value)]))
  return Object.fromEntries(
    keys.map((key) => {
      const value = found.get(key) ?? null
      return [key, value && value.trim() !== '' ? value : null]
    }),
  )
}

/** Writing an empty value deletes the row, so the environment takes over again. */
export async function writeSetting(
  key: string,
  value: string | null,
  adminId: string,
): Promise<void> {
  if (value === null || value.trim() === '') {
    await db.appSetting.deleteMany({ where: { key } })
    return
  }

  const encrypted = encryptSetting(value.trim())
  await db.appSetting.upsert({
    where: { key },
    create: { key, value: encrypted, updatedByAdminId: adminId },
    update: { value: encrypted, updatedByAdminId: adminId },
  })
}

/** When each setting was last changed, for the console. Never returns a value. */
export async function settingsMetadata(
  keys: string[],
): Promise<Record<string, { updatedAt: Date; updatedByEmail: string | null } | null>> {
  const rows = await db.appSetting.findMany({
    where: { key: { in: keys } },
    include: { updatedByAdmin: { select: { email: true } } },
  })
  const found = new Map(
    rows.map((row) => [
      row.key,
      { updatedAt: row.updatedAt, updatedByEmail: row.updatedByAdmin?.email ?? null },
    ]),
  )
  return Object.fromEntries(keys.map((key) => [key, found.get(key) ?? null]))
}
