import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  EXPIRY_WARNING_DAYS,
  type CodeForWarning,
  daysUntilExpiry,
  expiringSoonWhere,
  expiryWarningCutoff,
  warningVerdict,
} from '@/lib/code-expiry'

const now = new Date('2026-09-03T09:00:00Z')

function code(overrides: Partial<CodeForWarning> = {}): CodeForWarning {
  return {
    status: 'unused',
    email: 'buyer@example.com',
    expiresAt: new Date('2026-09-05T09:00:00Z'),
    expiryReminderSentAt: null,
    ...overrides,
  }
}

describe('warningVerdict', () => {
  it('warns an unredeemed code inside the window that has an address', () => {
    assert.equal(warningVerdict(code(), now), 'due')
  })

  it('never warns about a code that has already lapsed', () => {
    // The mail would say "this stopped working", which tells the holder nothing they
    // will not discover the moment they try it — and invites them to act on a code that
    // cannot be acted on. The desk extends it instead.
    assert.equal(warningVerdict(code({ expiresAt: new Date('2026-09-01T09:00:00Z') }), now), 'not_due')
    // The boundary belongs to "lapsed": isCodeExpired treats <= now as expired, and the
    // two must agree or a dead code gets a warning saying it has a day left.
    assert.equal(warningVerdict(code({ expiresAt: now }), now), 'not_due')
  })

  it('does not warn about a code that is comfortably in date', () => {
    assert.equal(warningVerdict(code({ expiresAt: new Date('2026-09-20T09:00:00Z') }), now), 'not_due')
  })

  it('separates a code with nowhere to send from one that is simply not due', () => {
    // The whole reason this is its own verdict: gifted codes are invisible otherwise, and
    // they are the ones most likely to be forgotten.
    assert.equal(warningVerdict(code({ email: null }), now), 'no_address')
    assert.equal(warningVerdict(code({ email: '' }), now), 'no_address')
  })

  it('warns once per expiry date', () => {
    assert.equal(
      warningVerdict(code({ expiryReminderSentAt: new Date('2026-09-02T09:00:00Z') }), now),
      'already_warned',
    )
  })

  it('has nothing to say about a redeemed code or one that never expires', () => {
    assert.equal(warningVerdict(code({ status: 'redeemed' }), now), 'not_applicable')
    assert.equal(warningVerdict(code({ expiresAt: null }), now), 'not_applicable')
  })

  it('ranks redeemed above everything, so a used code is never mailed about', () => {
    // A code can be redeemed *and* inside the window *and* unwarned. It must still be
    // silent: the holder already has their membership, and telling them their code is
    // about to expire would read as though the membership were.
    assert.equal(
      warningVerdict(code({ status: 'redeemed', email: 'used@example.com' }), now),
      'not_applicable',
    )
  })
})

describe('daysUntilExpiry', () => {
  it('rounds up, so a code with hours left never reads as zero days', () => {
    assert.equal(daysUntilExpiry(new Date('2026-09-03T20:00:00Z'), now), 1)
    assert.equal(daysUntilExpiry(new Date('2026-09-05T09:00:00Z'), now), 2)
    assert.equal(daysUntilExpiry(new Date('2026-09-06T09:00:00Z'), now), 3)
  })

  it('floors at zero rather than going negative', () => {
    assert.equal(daysUntilExpiry(new Date('2026-08-01T09:00:00Z'), now), 0)
  })
})

describe('expiringSoonWhere', () => {
  it('selects the same set the verdict calls due, including the unreachable ones', () => {
    const where = expiringSoonWhere(now)
    assert.equal(where.status, 'unused')
    assert.equal(where.expiryReminderSentAt, null)
    assert.deepEqual(where.expiresAt, { gt: now, lte: expiryWarningCutoff(now) })
    // No email filter. Codes with nowhere to send stay inside the set so they can be
    // counted and shown; filtering them out in SQL is how they would become invisible.
    assert.ok(!('email' in where))
  })

  it('opens a window of exactly the advertised length', () => {
    assert.equal(
      expiryWarningCutoff(now).getTime() - now.getTime(),
      EXPIRY_WARNING_DAYS * 86_400_000,
    )
  })
})
