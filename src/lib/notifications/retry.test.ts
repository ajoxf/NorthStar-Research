import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MAX_SEND_ATTEMPTS, withRateLimitRetry } from '@/lib/notifications/retry'
import type { DeliveryResult } from '@/lib/notifications/types'

const sent: DeliveryResult = { status: 'sent', provider: 'resend', providerMessageId: 'msg_1' }
const throttled: DeliveryResult = {
  status: 'failed',
  provider: 'resend',
  error: 'Too many requests. You can only make 10 requests per second.',
}
const rejected: DeliveryResult = {
  status: 'failed',
  provider: 'resend',
  error: 'Invalid `to` field. The mailbox does not exist.',
}

/** Replays a script of results, counting the calls. */
function attempts(script: DeliveryResult[]) {
  const calls: number[] = []
  return {
    calls,
    attempt: async () => {
      calls.push(calls.length + 1)
      return script[Math.min(calls.length - 1, script.length - 1)]
    },
  }
}

function recorder() {
  const slept: number[] = []
  return { slept, sleep: async (ms: number) => void slept.push(ms) }
}

describe('withRateLimitRetry', () => {
  it('does not retry a send that worked', async () => {
    const run = attempts([sent])
    const result = await withRateLimitRetry(run.attempt, { sleep: async () => {} })
    assert.equal(result.status, 'sent')
    assert.equal(run.calls.length, 1)
  })

  it('retries a rate-limited send and reports the success', async () => {
    // The whole point: this send was going to work. Recording it as failed loses an email
    // that the provider was only asking us to slow down for.
    const run = attempts([throttled, throttled, sent])
    const clock = recorder()
    const result = await withRateLimitRetry(run.attempt, { sleep: clock.sleep })
    assert.equal(result.status, 'sent')
    assert.equal(run.calls.length, 3)
    assert.deepEqual(clock.slept, [500, 1000])
  })

  it('does not retry a permanent rejection', async () => {
    const run = attempts([rejected])
    const clock = recorder()
    const result = await withRateLimitRetry(run.attempt, { sleep: clock.sleep })
    assert.equal(result.status, 'failed')
    assert.equal(run.calls.length, 1)
    assert.deepEqual(clock.slept, [])
  })

  it('gives up after a bounded number of attempts', async () => {
    /*
     * Bounded because publishing waits for delivery and the budget multiplies across the
     * member list. An unbounded retry is how a send gets killed by a function timeout
     * halfway down the list, which loses more mail than it saves.
     */
    const run = attempts([throttled])
    const clock = recorder()
    const result = await withRateLimitRetry(run.attempt, { sleep: clock.sleep })
    assert.equal(run.calls.length, MAX_SEND_ATTEMPTS)
    assert.equal(clock.slept.length, MAX_SEND_ATTEMPTS - 1)
    assert.equal(result.status, 'failed')
  })

  it('says in the recorded error that it was throttled, not refused', async () => {
    // This string is what the admin's delivery history shows. Until it said so, "we were
    // asked to slow down" and "that address is wrong" were the same line.
    const run = attempts([throttled])
    const result = await withRateLimitRetry(run.attempt, { sleep: async () => {} })
    assert.match(result.error ?? '', /rate limited; gave up after 4 attempts/)
  })

  it('keeps the provider’s own message alongside ours', async () => {
    const run = attempts([throttled])
    const result = await withRateLimitRetry(run.attempt, { sleep: async () => {} })
    assert.match(result.error ?? '', /10 requests per second/)
  })

  it('leaves a first-attempt message alone when retrying is switched off', async () => {
    // Nothing was given up on, so nothing should claim it was.
    const run = attempts([throttled])
    const result = await withRateLimitRetry(run.attempt, { maxAttempts: 1, sleep: async () => {} })
    assert.equal(result.error, throttled.error)
    assert.equal(run.calls.length, 1)
  })

  it('stops retrying as soon as the failure turns permanent', async () => {
    const run = attempts([throttled, rejected])
    const result = await withRateLimitRetry(run.attempt, { sleep: async () => {} })
    assert.equal(run.calls.length, 2)
    assert.equal(result.error, rejected.error)
  })
})
