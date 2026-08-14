import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { findNumbers } from '@/components/pdf-page'

/**
 * The rules behind the neon marking of numbers in the reading view.
 *
 * Worth testing rather than eyeballing: the marks exist to draw a reader straight to the
 * levels, and that only works if the marking is disciplined. Highlighting a date, a
 * footnote marker or the `4` in `4-hour` trains the eye to ignore the colour, at which
 * point the feature is worse than not having it.
 */

function marked(text: string): string[] {
  return findNumbers(text).map(({ start, end }) => text.slice(start, end))
}

describe('findNumbers', () => {
  it('marks levels, prices and ranges', () => {
    assert.deepEqual(marked('99.384'), ['99.384'])
    assert.deepEqual(marked('4,357'), ['4,357'])
    assert.deepEqual(marked('24,602.15'), ['24,602.15'])
    assert.deepEqual(marked('3.50–3.75%'), ['3.50–3.75%'])
    assert.deepEqual(marked('+0.2%'), ['+0.2%'])
    assert.deepEqual(marked('97.60–98.00'), ['97.60–98.00'])
  })

  it('marks every level inside a sentence, not just the first', () => {
    assert.deepEqual(
      marked('A close below 99.384 completes it, with objectives at 98.751 and 97.632.'),
      ['99.384', '98.751', '97.632'],
    )
  })

  it('leaves dates alone', () => {
    assert.deepEqual(marked('August 13, 2026'), [])
    assert.deepEqual(marked('Sep 29 hold'), [])
    // A year on its own is not a level either.
    assert.deepEqual(marked('through 2026'), [])
  })

  it('leaves numbers that are part of a word alone', () => {
    // The hyphenated timeframe adjectives this product uses constantly.
    assert.deepEqual(marked('the 4-hour framework'), [])
    assert.deepEqual(marked('a 1-hour double top'), [])
    assert.deepEqual(marked('H1 and Q3'), [])
  })

  it('leaves bare single digits alone', () => {
    // Page numbers, bullets and footnote markers — never levels.
    assert.deepEqual(marked('3'), [])
    assert.deepEqual(marked('Seven markets, 1 chain'), [])
  })

  it('still marks a two-digit level next to a word', () => {
    assert.deepEqual(marked('sitting on the 50 EMA'), ['50'])
  })

  it('returns nothing for text with no numbers', () => {
    assert.deepEqual(marked('Bias: neutral / range compression'), [])
    assert.deepEqual(marked(''), [])
  })
})
