/**
 * The cipher behind editable settings: AES-256-GCM under a key derived from AUTH_SECRET.
 *
 * Split out from secure-settings.ts, which owns the database side, so that this — the
 * part where a mistake silently weakens the encryption — can be unit-tested directly.
 * The storage module carries the reasoning about what this does and does not protect.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

import { requireEnv } from '@/lib/env'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

/**
 * A key derived from AUTH_SECRET, not AUTH_SECRET itself.
 *
 * The salt is fixed rather than random because the same key must decrypt what a previous
 * process encrypted, and there is nowhere to keep a per-value salt that an attacker with
 * the database would not also have. scrypt is used for the domain separation and cost,
 * not for password stretching — the input is already high-entropy.
 */
function encryptionKey(): Buffer {
  return scryptSync(requireEnv('AUTH_SECRET', 'Encrypted settings'), 'nordstar:app-setting', 32)
}

export function encryptSetting(plaintext: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString('base64')
}

/**
 * Returns null rather than throwing on anything unreadable.
 *
 * A corrupted row, or one written under a previous AUTH_SECRET, must not take down the
 * checkout that reads it. Callers treat null as "not configured here" and fall back to
 * the environment.
 */
export function decryptSetting(stored: string): string | null {
  try {
    const raw = Buffer.from(stored, 'base64')
    // A valid payload is the IV, the tag, and zero or more bytes between them — so
    // exactly IV+TAG is the encryption of an empty string, not a malformed row.
    if (raw.length < IV_BYTES + TAG_BYTES) return null

    const iv = raw.subarray(0, IV_BYTES)
    const tag = raw.subarray(raw.length - TAG_BYTES)
    const body = raw.subarray(IV_BYTES, raw.length - TAG_BYTES)

    const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8')
  } catch {
    // Wrong key, tampered ciphertext, or a value from before this feature existed.
    return null
  }
}
