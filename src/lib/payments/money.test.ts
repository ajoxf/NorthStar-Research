import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { fromMajor, minorUnitsFactor, toMajorString } from '@/lib/payments/money'

describe('money', () => {
  it('knows the currencies without two decimals', () => {
    assert.equal(minorUnitsFactor('usd'), 100)
    assert.equal(minorUnitsFactor('JPY'), 1)
    assert.equal(minorUnitsFactor('KWD'), 1000)
  })
  it('formats and parses major units', () => {
    assert.equal(toMajorString(12900, 'USD'), '129.00')
    assert.equal(toMajorString(1500, 'KWD'), '1.500')
    assert.equal(toMajorString(500, 'JPY'), '500')
    assert.equal(fromMajor('129.00', 'USD'), 12900)
    assert.equal(fromMajor(1.5, 'BHD'), 1500)
    assert.equal(fromMajor('0.1', 'USD') + fromMajor('0.2', 'USD'), 30)
  })
})
