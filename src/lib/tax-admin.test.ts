import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { validateTaxRow } from '@/lib/tax-admin'

describe('validateTaxRow', () => {
  it('stores a percent as a fraction', () => {
    const result = validateTaxRow({ name: 'Swiss VAT', label: 'VAT', ratePercent: 8.1 })
    assert.ok(result.ok)
    if (result.ok) {
      assert.equal(result.value.rate, 0.081)
      assert.equal(result.value.pricesIncludeTax, true)
      assert.equal(result.value.isActive, false)
    }
  })
  it('refuses rates outside 0–50% and a missing name', () => {
    assert.equal(validateTaxRow({ name: 'X', ratePercent: 60 }).ok, false)
    assert.equal(validateTaxRow({ name: 'X', ratePercent: -1 }).ok, false)
    assert.equal(validateTaxRow({ name: '', ratePercent: 5 }).ok, false)
  })
})
