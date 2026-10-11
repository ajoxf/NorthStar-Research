import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { revenueSummary } from '@/lib/revenue-shape'

describe('revenueSummary', () => {
  it('reports revenue net of tax and refunds, and the tax refunds handed back', () => {
    const sale = { grossCents: 12900, taxCents: 614 }
    const other = { grossCents: 9900, taxCents: 0 }
    const summary = revenueSummary([sale, other], [{ amountCents: 6450, order: sale }])
    assert.deepEqual(summary, { grossCents: 22800, taxCents: 307, refundedCents: 6450, netCents: 22800 - 614 - (6450 - 307) })
  })
})
