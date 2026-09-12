import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { clampDays, parseDays, trialEndsAt, trialRefusal, TRIAL_DEFAULTS } from './trial-shape'

describe('who may start a trial', () => {
  const ok = { enabled: true, itemExists: true, heldEver: false }

  it('lets a new account through', () => {
    assert.equal(trialRefusal(ok), null)
  })

  it('refuses when trials are switched off', () => {
    assert.equal(trialRefusal({ ...ok, enabled: false }), 'disabled')
  })

  it('refuses a second trial — even after the first has expired', () => {
    // Judged on ever, not currently. Otherwise the trial renews itself every month for
    // anyone patient enough to wait for the old one to lapse.
    assert.equal(trialRefusal({ ...ok, heldEver: true }), 'already_trialled')
  })

  it('refuses when the item does not exist', () => {
    // Before the backfill, or with the slug mistyped in settings. Better to refuse than to
    // create an account that is entitled to nothing.
    assert.equal(trialRefusal({ ...ok, itemExists: false }), 'no_item')
  })

  it('being switched off beats everything else', () => {
    assert.equal(
      trialRefusal({ enabled: false, itemExists: false, heldEver: true }),
      'disabled',
    )
  })
})

describe('how long a trial runs', () => {
  const from = new Date('2026-09-12T09:00:00Z')

  it('fourteen days by default', () => {
    assert.equal(TRIAL_DEFAULTS.days, 14)
    assert.equal(trialEndsAt(14, from).toISOString(), '2026-09-26T09:00:00.000Z')
  })

  it('is configurable', () => {
    assert.equal(trialEndsAt(30, from).toISOString(), '2026-10-12T09:00:00.000Z')
    assert.equal(trialEndsAt(90, from).toISOString(), '2026-12-11T09:00:00.000Z')
  })

  it('crosses a month end without inventing a date', () => {
    const end = trialEndsAt(30, new Date('2026-01-31T00:00:00Z'))
    assert.equal(end.toISOString(), '2026-03-02T00:00:00.000Z')
  })
})

describe('a day count nobody should be able to break', () => {
  it('falls back to the default rather than to zero', () => {
    // A setting somebody fat-fingered should give the normal trial, not an expired one.
    assert.equal(parseDays(null), 14)
    assert.equal(parseDays(''), 14)
    assert.equal(parseDays('fourteen'), 14)
  })

  it('reads a stored number', () => {
    assert.equal(parseDays('14'), 14)
    assert.equal(parseDays('7'), 7)
  })

  it('clamps both ends', () => {
    // A negative trial is nonsense; a thousand-day one is a comp nobody meant to grant.
    assert.equal(clampDays(0), 1)
    assert.equal(clampDays(-5), 1)
    assert.equal(clampDays(9999), 365)
    assert.equal(parseDays('-5'), 1)
    assert.equal(parseDays('9999'), 365)
  })

  it('rounds rather than truncating to nothing', () => {
    assert.equal(clampDays(30.6), 31)
    assert.equal(clampDays(0.4), 1)
  })
})
