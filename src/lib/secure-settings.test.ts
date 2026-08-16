import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

// Set before any test runs. The key is derived lazily, on first encrypt, so a plain
// import is enough — there is no module-load-time read to race with.
process.env.AUTH_SECRET ??= 'test-only-secret-for-encryption-round-trips'

import { decryptSetting, encryptSetting } from '@/lib/settings-crypto'

describe('encryptSetting / decryptSetting', () => {
  it('round-trips a value', () => {
    const secret = 'cregis-api-key-abcdef0123456789'
    assert.equal(decryptSetting(encryptSetting(secret)), secret)
  })

  it('produces different ciphertext each time', () => {
    // A fresh IV per write. Identical ciphertext for identical input would leak that two
    // settings share a value, and would make the stored key comparable across rotations.
    const a = encryptSetting('same-value')
    const b = encryptSetting('same-value')
    assert.notEqual(a, b)
    assert.equal(decryptSetting(a), decryptSetting(b))
  })

  it('never stores the plaintext', () => {
    const stored = encryptSetting('super-secret-key')
    assert.ok(!stored.includes('super-secret-key'))
    assert.ok(!Buffer.from(stored, 'base64').toString('utf8').includes('super-secret-key'))
  })

  it('refuses tampered ciphertext rather than returning garbage', () => {
    // GCM authenticates; a flipped byte must fail the tag check, not decrypt to nonsense.
    const raw = Buffer.from(encryptSetting('value'), 'base64')
    raw[raw.length - 1] ^= 0xff
    assert.equal(decryptSetting(raw.toString('base64')), null)
  })

  it('returns null for junk instead of throwing', () => {
    // A row written under a previous AUTH_SECRET lands here. Callers treat null as
    // "not configured" and fall back to the environment, so checkout keeps working.
    assert.equal(decryptSetting('not-base64-at-all!!'), null)
    assert.equal(decryptSetting(''), null)
    assert.equal(decryptSetting(Buffer.from('too-short').toString('base64')), null)
  })

  it('handles an empty string and unicode', () => {
    assert.equal(decryptSetting(encryptSetting('')), '')
    assert.equal(decryptSetting(encryptSetting('ключ—🔑')), 'ключ—🔑')
  })
})
