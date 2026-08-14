import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CODE_VALIDITY_DAYS, codeExpiresAt, isCodeExpired, normaliseCode } from '@/lib/codes'

/**
 * Access-code validity.
 *
 * Worth pinning down in tests because both failure directions are expensive: a code that
 * lapses early strands somebody who has paid, and one that never lapses is an open-ended
 * grant sitting in an inbox. The boundary conditions are where that goes wrong.
 */

describe('code expiry', () => {
  const issued = new Date('2026-08-01T09:00:00Z')

  it('is valid for exactly the stated number of days', () => {
    const expires = codeExpiresAt(issued)
    const days = (expires.getTime() - issued.getTime()) / 86_400_000
    assert.equal(days, CODE_VALIDITY_DAYS)
  })

  it('is still usable the instant before it lapses', () => {
    const expiresAt = codeExpiresAt(issued)
    const aMomentBefore = new Date(expiresAt.getTime() - 1000)
    assert.equal(isCodeExpired({ expiresAt }, aMomentBefore), false)
  })

  it('is expired at the moment it lapses, not a moment later', () => {
    const expiresAt = codeExpiresAt(issued)
    assert.equal(isCodeExpired({ expiresAt }, expiresAt), true)
  })

  it('treats a code with no expiry as permanently valid', () => {
    // Codes issued before validity existed. Retroactively killing one already sitting in
    // somebody's inbox would be worse than an old code living on.
    assert.equal(isCodeExpired({ expiresAt: null }, new Date('2030-01-01T00:00:00Z')), false)
  })

  it('does not shift the expiry of the date it was given', () => {
    const before = issued.getTime()
    codeExpiresAt(issued)
    assert.equal(issued.getTime(), before)
  })
})

describe('normaliseCode', () => {
  it('accepts what people actually type', () => {
    for (const input of ['nsr-4kfp-9tqx', 'NSR4KFP9TQX', '  4kfp 9tqx  ', '4KFP-9TQX']) {
      assert.equal(normaliseCode(input), 'NSR-4KFP-9TQX', `failed for ${JSON.stringify(input)}`)
    }
  })

  it('leaves something that is not a code recognisably wrong', () => {
    // Better to hand the lookup an obviously invalid string than to pad it into a
    // well-formed code that happens to belong to somebody else.
    assert.equal(normaliseCode('hello'), 'HELLO')
  })
})
