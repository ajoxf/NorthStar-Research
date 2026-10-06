import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  RESEND_LIMIT_PER_SECOND,
  SEND_PER_SECOND,
  createPacer,
  minIntervalMs,
  paceDelayMs,
} from '@/lib/send-rate'

describe('the configured rate', () => {
  it('sits below the provider limit, leaving room for transactional mail', () => {
    // The limit is account-wide. A receipt or a magic link sent from another request
    // during a bulk send draws on the same allowance, and nothing in-process can see it.
    assert.ok(SEND_PER_SECOND < RESEND_LIMIT_PER_SECOND)
  })
})

describe('minIntervalMs', () => {
  it('rounds up, so a long run does not drift over the limit', () => {
    // 1000/3 is 333.33; three requests at 333ms are 999ms apart and the fourth breaches.
    assert.equal(minIntervalMs(3), 334)
  })

  it('refuses a rate that would divide by zero or run backwards', () => {
    assert.throws(() => minIntervalMs(0), RangeError)
    assert.throws(() => minIntervalMs(-1), RangeError)
  })
})

describe('paceDelayMs', () => {
  it('does not delay the first request', () => {
    assert.equal(paceDelayMs({ perSecond: 8, lastStartedAt: null, now: 1_000 }), 0)
  })

  it('waits out the remainder of the interval', () => {
    // 8/second is a 125ms interval; 40ms has passed, so 85ms is owed.
    assert.equal(paceDelayMs({ perSecond: 8, lastStartedAt: 1_000, now: 1_040 }), 85)
  })

  it('does not delay when the interval has already passed', () => {
    // A slow request has already spent its slot — the limit counts requests issued, so
    // waiting again here would halve the rate for no reason.
    assert.equal(paceDelayMs({ perSecond: 8, lastStartedAt: 1_000, now: 5_000 }), 0)
  })
})

/** A clock and a sleep that advances it, so pacing is tested without waiting. */
function fakeClock(start = 0) {
  let t = start
  const slept: number[] = []
  return {
    now: () => t,
    sleep: async (ms: number) => {
      slept.push(ms)
      t += ms
    },
    advance: (ms: number) => {
      t += ms
    },
    slept,
  }
}

describe('createPacer', () => {
  it('lets the first caller straight through', async () => {
    const clock = fakeClock()
    const pacer = createPacer({ perSecond: 8, now: clock.now, sleep: clock.sleep })
    await pacer.wait()
    assert.deepEqual(clock.slept, [])
  })

  it('holds the interval between consecutive callers', async () => {
    const clock = fakeClock()
    const pacer = createPacer({ perSecond: 8, now: clock.now, sleep: clock.sleep })
    await pacer.wait()
    await pacer.wait()
    await pacer.wait()
    assert.deepEqual(clock.slept, [125, 125])
  })

  it('charges nothing when the caller was slow anyway', async () => {
    const clock = fakeClock()
    const pacer = createPacer({ perSecond: 8, now: clock.now, sleep: clock.sleep })
    await pacer.wait()
    clock.advance(400) // the request itself took longer than the interval
    await pacer.wait()
    assert.deepEqual(clock.slept, [])
  })

  it('paces callers that arrive at the same instant', async () => {
    /*
     * The case that makes the burst. Without queueing, concurrent callers all read the
     * same `lastStartedAt`, all compute the same delay, and all issue their requests
     * together — which is exactly the breach the pacer exists to prevent. The delivery
     * loop is sequential today; this is what keeps it safe when it is not.
     */
    const clock = fakeClock()
    const pacer = createPacer({ perSecond: 8, now: clock.now, sleep: clock.sleep })
    await Promise.all([pacer.wait(), pacer.wait(), pacer.wait(), pacer.wait()])
    assert.deepEqual(clock.slept, [125, 125, 125])
  })

  it('keeps serving later callers after one of them fails', async () => {
    // A send that throws must not wedge the queue and strand every member behind it.
    const clock = fakeClock()
    let fail = true
    const pacer = createPacer({
      perSecond: 8,
      now: clock.now,
      sleep: async (ms) => {
        if (fail) {
          fail = false
          throw new Error('timer blew up')
        }
        await clock.sleep(ms)
      },
    })
    await pacer.wait()
    await assert.rejects(pacer.wait())
    await pacer.wait()
    assert.deepEqual(clock.slept, [125])
  })
})
