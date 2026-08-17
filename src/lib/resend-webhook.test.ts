import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { describe, it } from 'node:test'

import {
  OUTCOME_RANK,
  outcomeForEvent,
  readSvixHeaders,
  verifyResendSignature,
} from '@/lib/resend-webhook'

const SECRET = 'whsec_' + Buffer.from('a-test-signing-secret-value').toString('base64')
const BODY = JSON.stringify({ type: 'email.opened', data: { email_id: 'msg_1' } })
const NOW = 1_800_000_000

function sign(body: string, id: string, timestamp: number, secret = SECRET): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  return createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
}

function headers(overrides: Partial<{ id: string; timestamp: string; signature: string }> = {}) {
  const id = overrides.id ?? 'msg_abc'
  const timestamp = overrides.timestamp ?? String(NOW)
  return {
    id,
    timestamp,
    signature: overrides.signature ?? `v1,${sign(BODY, id, Number(timestamp))}`,
  }
}

describe('verifyResendSignature', () => {
  it('accepts a correctly signed event', () => {
    assert.equal(verifyResendSignature(BODY, headers(), SECRET, NOW), true)
  })

  it('refuses a tampered body', () => {
    // The whole point: an attacker replaying a real signature with different data.
    const forged = JSON.stringify({ type: 'email.opened', data: { email_id: 'msg_OTHER' } })
    assert.equal(verifyResendSignature(forged, headers(), SECRET, NOW), false)
  })

  it('refuses the wrong secret', () => {
    const other = 'whsec_' + Buffer.from('a-different-secret').toString('base64')
    assert.equal(verifyResendSignature(BODY, headers(), other, NOW), false)
  })

  it('refuses a replay outside the tolerance window', () => {
    // A captured request stays valid forever without this check.
    const old = NOW - 6 * 60
    const stale = headers({ timestamp: String(old), signature: `v1,${sign(BODY, 'msg_abc', old)}` })
    assert.equal(verifyResendSignature(BODY, stale, SECRET, NOW), false)
  })

  it('accepts inside the tolerance window', () => {
    const recent = NOW - 60
    const fresh = headers({
      timestamp: String(recent),
      signature: `v1,${sign(BODY, 'msg_abc', recent)}`,
    })
    assert.equal(verifyResendSignature(BODY, fresh, SECRET, NOW), true)
  })

  it('accepts when one of several signatures matches', () => {
    // What a secret rotation looks like on the wire.
    const good = sign(BODY, 'msg_abc', NOW)
    const both = headers({ signature: `v1,not-the-right-one v1,${good}` })
    assert.equal(verifyResendSignature(BODY, both, SECRET, NOW), true)
  })

  it('ignores unknown signature versions', () => {
    assert.equal(
      verifyResendSignature(BODY, headers({ signature: `v2,${sign(BODY, 'msg_abc', NOW)}` }), SECRET, NOW),
      false,
    )
  })

  it('refuses when a header is missing', () => {
    assert.equal(verifyResendSignature(BODY, { id: null, timestamp: null, signature: null }, SECRET, NOW), false)
    assert.equal(verifyResendSignature(BODY, { ...headers(), signature: null }, SECRET, NOW), false)
  })

  it('refuses a non-numeric timestamp', () => {
    assert.equal(verifyResendSignature(BODY, headers({ timestamp: 'soon' }), SECRET, NOW), false)
  })
})

describe('readSvixHeaders', () => {
  it('reads the three svix headers', () => {
    const h = new Headers({ 'svix-id': 'a', 'svix-timestamp': '1', 'svix-signature': 'v1,x' })
    assert.deepEqual(readSvixHeaders(h), { id: 'a', timestamp: '1', signature: 'v1,x' })
  })
})

describe('outcomeForEvent', () => {
  it('maps the events we record', () => {
    assert.equal(outcomeForEvent('email.delivered')?.status, 'delivered')
    assert.equal(outcomeForEvent('email.opened')?.status, 'opened')
    assert.equal(outcomeForEvent('email.clicked')?.status, 'clicked')
    assert.equal(outcomeForEvent('email.bounced')?.status, 'failed')
    assert.equal(outcomeForEvent('email.complained')?.status, 'failed')
  })

  it('ignores events with nothing to record', () => {
    assert.equal(outcomeForEvent('email.sent'), null)
    assert.equal(outcomeForEvent('email.delivery_delayed'), null)
    assert.equal(outcomeForEvent('something.new'), null)
  })

  it('ranks so a late event cannot undo a later state', () => {
    // Events are not ordered. A `delivered` arriving after an `opened` must not walk the
    // row backwards and under-report engagement.
    const delivered = outcomeForEvent('email.delivered')!
    const opened = outcomeForEvent('email.opened')!
    const bounced = outcomeForEvent('email.bounced')!
    assert.ok(opened.rank > delivered.rank)
    assert.ok(bounced.rank > opened.rank)
    assert.ok(OUTCOME_RANK.opened > OUTCOME_RANK.delivered)
    assert.ok(OUTCOME_RANK.delivered > OUTCOME_RANK.sent)
  })
})
