import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { invoiceFigures, type InvoiceOrder } from '@/lib/invoice-shape'

const base: InvoiceOrder = {
  number: 46,
  currency: 'USD',
  totalCents: 12900,
  taxCents: 614,
  taxRate: 0.05,
  taxName: 'UAE VAT',
  subtotalCents: 12900,
  discountCents: 0,
  reverseCharge: false,
  billingCountry: 'AE',
  refundedCents: 0,
  lines: [
    { name: 'Energy by Sarah Chen', chargeCents: 3000 },
    { name: 'Energy by Dean Ross', chargeCents: 9900 },
  ],
}

describe('invoiceFigures', () => {
  it('splits the totals across lines so they add up, and converts UAE VAT to AED', () => {
    const figures = invoiceFigures(base)
    assert.equal(figures.lines.reduce((sum, line) => sum + line.totalCents, 0), 12900)
    assert.equal(figures.lines.reduce((sum, line) => sum + line.taxCents, 0), 614)
    assert.equal(figures.taxableCents, 12286)
    assert.deepEqual(figures.aed, { rate: 3.6725, vatAed: 2255 })
    assert.equal(figures.status, 'Paid')
  })
  it('shows what reverse charge left out', () => {
    const figures = invoiceFigures({ ...base, totalCents: 10084, taxCents: 0, subtotalCents: 12000, reverseCharge: true, billingCountry: 'DE', taxName: null })
    assert.equal(figures.reverseChargedCents, 1916)
    assert.equal(figures.aed, null)
  })
  it('marks refunds', () => {
    assert.equal(invoiceFigures({ ...base, refundedCents: 100 }).status, 'Partly refunded')
    assert.equal(invoiceFigures({ ...base, refundedCents: 12900 }).status, 'Refunded')
  })
})
