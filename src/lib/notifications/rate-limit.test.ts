import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { backoffMs, isRateLimit } from '@/lib/notifications/rate-limit'

describe('isRateLimit', () => {
  it('reads Resend’s own name for it', () => {
    assert.equal(
      isRateLimit({ name: 'rate_limit_exceeded', message: 'Too many requests.' }),
      true,
    )
  })

  it('reads a 429 off whichever status field carries it', () => {
    assert.equal(isRateLimit({ statusCode: 429 }), true)
    assert.equal(isRateLimit({ status: 429 }), true)
    assert.equal(isRateLimit({ code: '429' }), true)
  })

  it('reads the message, which is all a recorded failure keeps', () => {
    // The delivery log stores `error` as a string, so a retry decision taken from a
    // stored row has nothing else to go on.
    assert.equal(isRateLimit('Too many requests. You can only make 10 requests per second.'), true)
    assert.equal(isRateLimit('Rate limit exceeded'), true)
  })

  it('does not treat a permanent rejection as transient', () => {
    /*
     * The direction that matters more. Retrying a bad address is three more identical
     * refusals and three more waits, and every member still queued waits them out too.
     */
    assert.equal(isRateLimit({ name: 'validation_error', message: 'Invalid `to` field.' }), false)
    assert.equal(isRateLimit({ statusCode: 422, message: 'The mailbox does not exist.' }), false)
  })

  it('does not take the digits 429 inside a message as a status', () => {
    // Provider messages carry ids and counts. A message that happens to contain those
    // digits is not a rate limit, and reading it as one would retry a dead address.
    assert.equal(isRateLimit({ message: 'Message 8f429c1 was rejected by the recipient.' }), false)
  })

  it('is false for no error at all, which is what a successful send has', () => {
    assert.equal(isRateLimit(undefined), false)
    assert.equal(isRateLimit(null), false)
    assert.equal(isRateLimit(''), false)
  })
})

describe('backoffMs', () => {
  it('starts short, because a per-second limit usually clears within a second', () => {
    assert.equal(backoffMs(1), 500)
  })

  it('doubles, to cover an account that stays busy', () => {
    assert.deepEqual([1, 2, 3, 4].map((n) => backoffMs(n)), [500, 1000, 2000, 4000])
  })
})
