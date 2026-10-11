import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { cleanTaxId, computeTax, formatRate, taxInPaid, taxOrder, taxedUnitCents, type TaxRule } from '@/lib/tax-shape'

const rule = (rate: number, pricesIncludeTax = true, reverseCharge = false): TaxRule => ({
  countryCode: 'XX',
  name: 'Test VAT',
  label: 'VAT',
  rate,
  pricesIncludeTax,
  reverseCharge,
})
const one = (cents: number, charge = cents) => [{ listCents: cents, chargeCents: charge }]

describe('computeTax', () => {
  it('carves inclusive tax out of the price, and adds exclusive tax on top', () => {
    assert.deepEqual(computeTax(12900, 0.05, true), { net: 12286, tax: 614, total: 12900 })
    assert.deepEqual(computeTax(10000, 0.1, false), { net: 10000, tax: 1000, total: 11000 })
    assert.deepEqual(computeTax(5000, 0, true), { net: 5000, tax: 0, total: 5000 })
  })
})

describe('taxOrder', () => {
  it('1. UAE VAT 5% included in $129: $6.14 tax, $129 total', () => {
    const order = taxOrder(one(12900), { ...rule(0.05), name: 'UAE VAT' })
    assert.equal(order.taxCents, 614)
    assert.equal(order.totalCents, 12900)
    assert.equal(order.taxName, 'UAE VAT')
    assert.equal(order.taxRate, 0.05)
  })
  it('2. 10% added on top of $100: $110', () => {
    const order = taxOrder(one(10000), rule(0.1, false))
    assert.equal(order.taxCents, 1000)
    assert.equal(order.totalCents, 11000)
  })
  it('3. no rule: no tax, no name', () => {
    const order = taxOrder(one(9900), null)
    assert.deepEqual([order.taxCents, order.totalCents, order.taxRate, order.taxName], [0, 9900, 0, null])
  })
  it('4. reverse charge: a business with a VAT number pays $100.84 of $120; without one, $120 with $19.16 VAT', () => {
    const de = { ...rule(0.19, true, true), name: 'Germany VAT' }
    const business = taxOrder(one(12000), de, 'DE 123 456 789')
    assert.equal(business.totalCents, 10084)
    assert.equal(business.taxCents, 0)
    assert.equal(business.reverseCharge, true)
    assert.equal(business.reverseChargedCents, 1916)
    assert.equal(business.taxName, null)
    const consumer = taxOrder(one(12000), de)
    assert.deepEqual([consumer.totalCents, consumer.taxCents, consumer.reverseCharge], [12000, 1916, false])
  })
  it('does not reverse-charge where the rule does not allow it, or with a blank tax ID', () => {
    assert.equal(taxOrder(one(10000), rule(0.05), 'AE123').reverseCharge, false)
    assert.equal(taxOrder(one(10000), rule(0.19, true, true), '   ').reverseCharge, false)
  })
  it('5. a 50% coupon comes off before tax', () => {
    const order = taxOrder(one(10000, 5000), rule(0.1, false))
    assert.deepEqual([order.subtotalCents, order.discountCents, order.taxCents, order.totalCents], [10000, 5000, 500, 5500])
  })
  it('shares totals and tax across lines to the cent', () => {
    const order = taxOrder(
      [
        { listCents: 9900, chargeCents: 9900 },
        { listCents: 34900, chargeCents: 34900 },
      ],
      rule(0.1, false),
    )
    assert.equal(order.lines.reduce((sum, line) => sum + line.totalCents, 0), order.totalCents)
    assert.equal(order.lines.reduce((sum, line) => sum + line.taxCents, 0), order.taxCents)
    assert.equal(order.totalCents, 49280)
  })
})

describe('card prices and renewals', () => {
  it('prices a recurring card line so it charges what was quoted', () => {
    assert.equal(taxedUnitCents(9900, rule(0.05), false), 9900)
    assert.equal(taxedUnitCents(10000, rule(0.1, false), false), 11000)
    assert.equal(taxedUnitCents(12000, rule(0.19, true, true), true), 10084)
    assert.equal(taxedUnitCents(9900, null, false), 9900)
  })
  it('finds the tax in a renewal paid at the sale rate', () => {
    assert.equal(taxInPaid(12900, 0.05, false), 614)
    assert.equal(taxInPaid(11000, 0.1, false), 1000)
    assert.equal(taxInPaid(10084, 0.19, true), 0)
  })
  it('cleans tax IDs and formats rates', () => {
    assert.equal(cleanTaxId(' de 123 456 '), 'DE123456')
    assert.equal(cleanTaxId(''), null)
    assert.equal(formatRate(0.081), '8.1%')
    assert.equal(formatRate(0.255), '25.5%')
  })
})
