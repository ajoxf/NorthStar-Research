import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseRating, performanceClaim, reviewCountLabel, summariseRatings } from './review-shape'

describe('parseRating', () => {
  it('takes whole stars from 1 to 5', () => {
    assert.equal(parseRating(4), 4)
    assert.equal(parseRating('5'), 5)
    assert.equal(parseRating(0), null)
    assert.equal(parseRating(6), null)
    assert.equal(parseRating(3.5), null)
    assert.equal(parseRating('x'), null)
  })
})

describe('performanceClaim', () => {
  it('flags returns, percentages, money and multiples', () => {
    assert.match(performanceClaim('Made me 40% last quarter') ?? '', /percentage/)
    assert.match(performanceClaim('I turned $500 into more') ?? '', /money/)
    assert.match(performanceClaim('doubled my account') ?? '', /multiple/)
    assert.match(performanceClaim('Caught 120 pips on gold') ?? '', /pips/)
    assert.match(performanceClaim('Very profitable calls') ?? '', /returns or profit/)
    assert.match(performanceClaim('Guaranteed winners') ?? '', /returns or profit/)
  })
  it('leaves an ordinary opinion alone', () => {
    assert.equal(performanceClaim('Clear charts and the macro context is well explained.'), null)
    assert.equal(performanceClaim(''), null)
    assert.equal(performanceClaim(null), null)
  })
})

describe('summariseRatings', () => {
  it('averages to one decimal', () => {
    assert.deepEqual(summariseRatings([5, 4, 4]), { average: 4.3, count: 3 })
    assert.deepEqual(summariseRatings([5]), { average: 5, count: 1 })
  })
  it('is null with nothing to average', () => {
    assert.equal(summariseRatings([]), null)
  })
  it('labels counts', () => {
    assert.equal(reviewCountLabel(1), '1 review')
    assert.equal(reviewCountLabel(3), '3 reviews')
  })
})
