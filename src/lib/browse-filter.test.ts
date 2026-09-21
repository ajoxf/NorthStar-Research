import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  browseFilterActive,
  browseOrder,
  EMPTY_BROWSE_FILTER,
  matchesBrowseFilter,
  priceCeilings,
  toggleValue,
  type BrowseItem,
} from '@/lib/browse-filter'

const item = (over: Partial<BrowseItem> = {}): BrowseItem => ({
  id: 'a',
  subjects: ['Crude Oil'],
  authors: ['dean-rogers'],
  priceCents: 14900,
  hasTrial: false,
  ...over,
})

describe('matchesBrowseFilter', () => {
  it('keeps everything when nothing is chosen', () => {
    // The case that renders on arrival. Getting this wrong shows an empty page.
    assert.equal(matchesBrowseFilter(item(), EMPTY_BROWSE_FILTER), true)
    assert.equal(
      matchesBrowseFilter(item({ priceCents: null, subjects: [], authors: [] }), EMPTY_BROWSE_FILTER),
      true,
    )
  })

  it('ORs within a dimension', () => {
    const filter = { ...EMPTY_BROWSE_FILTER, subjects: ['Crude Oil', 'FX'] }
    assert.equal(matchesBrowseFilter(item({ subjects: ['FX'] }), filter), true)
    assert.equal(matchesBrowseFilter(item({ subjects: ['Precious Metals'] }), filter), false)
  })

  it('ANDs across dimensions', () => {
    const filter = { ...EMPTY_BROWSE_FILTER, subjects: ['Crude Oil'], authors: ['maya'] }
    // Right subject, wrong author.
    assert.equal(matchesBrowseFilter(item(), filter), false)
    assert.equal(matchesBrowseFilter(item({ authors: ['maya'] }), filter), true)
  })

  it('matches a row that covers several subjects on any one of them', () => {
    const row = item({ subjects: ['Crude Oil', 'Precious Metals'] })
    assert.equal(
      matchesBrowseFilter(row, { ...EMPTY_BROWSE_FILTER, subjects: ['Precious Metals'] }),
      true,
    )
  })

  it('keeps only rows with a trial when asked', () => {
    const filter = { ...EMPTY_BROWSE_FILTER, trialOnly: true }
    assert.equal(matchesBrowseFilter(item({ hasTrial: true }), filter), true)
    assert.equal(matchesBrowseFilter(item({ hasTrial: false }), filter), false)
  })

  it('drops an unpriced row under a ceiling rather than treating it as free', () => {
    // An announced contributor with nothing on sale must not surface to a budget shopper.
    const filter = { ...EMPTY_BROWSE_FILTER, maxPriceCents: 10000 }
    assert.equal(matchesBrowseFilter(item({ priceCents: null }), filter), false)
    assert.equal(matchesBrowseFilter(item({ priceCents: 4900 }), filter), true)
    assert.equal(matchesBrowseFilter(item({ priceCents: 14900 }), filter), false)
  })

  it('treats a ceiling as inclusive', () => {
    const filter = { ...EMPTY_BROWSE_FILTER, maxPriceCents: 4900 }
    assert.equal(matchesBrowseFilter(item({ priceCents: 4900 }), filter), true)
  })

  it('keeps an unpriced row when no ceiling is set', () => {
    assert.equal(matchesBrowseFilter(item({ priceCents: null }), EMPTY_BROWSE_FILTER), true)
  })
})

describe('browseOrder', () => {
  const rows = [
    item({ id: 'mid', priceCents: 14900 }),
    item({ id: 'cheap', priceCents: 4900 }),
    item({ id: 'none', priceCents: null }),
    item({ id: 'dear', priceCents: 34900 }),
  ]

  it('preserves the page order when no sort is asked for', () => {
    assert.deepEqual(browseOrder(rows, EMPTY_BROWSE_FILTER), ['mid', 'cheap', 'none', 'dear'])
  })

  it('sorts cheapest first, unpriced last', () => {
    assert.deepEqual(browseOrder(rows, { ...EMPTY_BROWSE_FILTER, sort: 'price-asc' }), [
      'cheap',
      'mid',
      'dear',
      'none',
    ])
  })

  it('sorts dearest first, and still leaves unpriced last', () => {
    // Not simply the reverse: "price unknown" has no place at either end of the answer.
    assert.deepEqual(browseOrder(rows, { ...EMPTY_BROWSE_FILTER, sort: 'price-desc' }), [
      'dear',
      'mid',
      'cheap',
      'none',
    ])
  })

  it('filters before it sorts', () => {
    const order = browseOrder(rows, { ...EMPTY_BROWSE_FILTER, maxPriceCents: 15000, sort: 'price-asc' })
    assert.deepEqual(order, ['cheap', 'mid'])
  })

  it('returns nothing when the filter excludes everything', () => {
    assert.deepEqual(browseOrder(rows, { ...EMPTY_BROWSE_FILTER, subjects: ['Nothing'] }), [])
  })
})

describe('priceCeilings', () => {
  it('offers only ceilings that actually divide the range', () => {
    // $49 to $349: a $50 band keeps one and excludes three; $500 would keep everything.
    const ceilings = priceCeilings([
      item({ id: 'a', priceCents: 4900 }),
      item({ id: 'b', priceCents: 14900 }),
      item({ id: 'c', priceCents: 34900 }),
    ])
    assert.deepEqual(ceilings, [5000, 10000, 15000, 20000, 30000])
  })

  it('offers none when everything costs the same', () => {
    const ceilings = priceCeilings([
      item({ id: 'a', priceCents: 9900 }),
      item({ id: 'b', priceCents: 9900 }),
    ])
    assert.deepEqual(ceilings, [])
  })

  it('offers none for a single row, or for none', () => {
    assert.deepEqual(priceCeilings([item()]), [])
    assert.deepEqual(priceCeilings([]), [])
  })

  it('ignores unpriced rows when reading the range', () => {
    const ceilings = priceCeilings([
      item({ id: 'a', priceCents: null }),
      item({ id: 'b', priceCents: 4900 }),
      item({ id: 'c', priceCents: 19900 }),
    ])
    assert.deepEqual(ceilings, [5000, 10000, 15000])
  })
})

describe('browseFilterActive', () => {
  it('is false for an untouched filter', () => {
    assert.equal(browseFilterActive(EMPTY_BROWSE_FILTER), false)
  })

  it('ignores sort, which reorders rather than narrows', () => {
    assert.equal(browseFilterActive({ ...EMPTY_BROWSE_FILTER, sort: 'price-asc' }), false)
  })

  it('is true for any narrowing dimension', () => {
    assert.equal(browseFilterActive({ ...EMPTY_BROWSE_FILTER, subjects: ['FX'] }), true)
    assert.equal(browseFilterActive({ ...EMPTY_BROWSE_FILTER, authors: ['dean'] }), true)
    assert.equal(browseFilterActive({ ...EMPTY_BROWSE_FILTER, maxPriceCents: 5000 }), true)
    assert.equal(browseFilterActive({ ...EMPTY_BROWSE_FILTER, trialOnly: true }), true)
  })
})

describe('toggleValue', () => {
  it('adds then removes', () => {
    assert.deepEqual(toggleValue([], 'fx'), ['fx'])
    assert.deepEqual(toggleValue(['fx'], 'fx'), [])
    assert.deepEqual(toggleValue(['fx'], 'oil'), ['fx', 'oil'])
  })
})
