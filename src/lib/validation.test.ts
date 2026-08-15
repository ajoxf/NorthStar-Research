import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { emailSchema } from '@/lib/validation'

/**
 * The email field.
 *
 * These are regression tests for a bug that broke sign-in, magic links, redemption and
 * both checkout routes at once: `z.string().email()` rejects an address with surrounding
 * whitespace, and the routes trimmed only *after* parsing, by which point Zod had already
 * refused it. Autofill, password managers and iOS autocorrect all produce that whitespace
 * routinely, so this was not an edge case — it was a silent tax on every entry point,
 * including the ones people pay through.
 */

describe('emailSchema', () => {
  it('accepts an address surrounded by whitespace', () => {
    // The exact input a password manager or a copy-paste hands over.
    for (const input of ['sam@example.com ', ' sam@example.com', '  sam@example.com  ', '\tsam@example.com\n']) {
      const result = emailSchema.safeParse(input)
      assert.ok(result.success, `rejected ${JSON.stringify(input)}`)
      assert.equal(result.data, 'sam@example.com')
    }
  })

  it('lowercases, because addresses are stored lowercased', () => {
    // A lookup with the typed casing would otherwise miss the account — and on the
    // Google callback it would create a duplicate member with no subscription.
    assert.equal(emailSchema.parse('Sam.Jones@Example.COM'), 'sam.jones@example.com')
  })

  it('still refuses things that are not addresses', () => {
    for (const input of ['', '   ', 'sam', 'sam@', '@example.com', 'sam@example', 'a b@example.com']) {
      assert.equal(
        emailSchema.safeParse(input).success,
        false,
        `accepted ${JSON.stringify(input)}`,
      )
    }
  })

  it('reports a message a person can act on', () => {
    const result = emailSchema.safeParse('nope')
    assert.equal(result.success, false)
    assert.equal(result.error.issues[0]?.message, 'Enter a valid email address.')
  })
})
