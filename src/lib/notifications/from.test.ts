import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { DEFAULT_EMAIL_FROM, normaliseFrom } from './from'

describe('normaliseFrom', () => {
  it('adds the missing space before the address', () => {
    assert.equal(normaliseFrom('NordStar Insights<team@nordstarpro.com>'), 'NordStar Insights <team@nordstarpro.com>')
  })
  it('leaves a well-formed or bare address alone', () => {
    assert.equal(normaliseFrom('NordStar Insights <team@nordstarpro.com>'), 'NordStar Insights <team@nordstarpro.com>')
    assert.equal(normaliseFrom('team@nordstarpro.com'), 'team@nordstarpro.com')
    assert.equal(normaliseFrom('  <team@nordstarpro.com>  '), '<team@nordstarpro.com>')
  })
  it('defaults to the nordstarpro.com sender', () => {
    assert.match(DEFAULT_EMAIL_FROM, /@nordstarpro\.com>$/)
  })
})
