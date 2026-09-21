import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { featuredIsCurated, featuredTopics } from '@/lib/featured-topics'

const t = (name: string, featured = false) => ({ name, featured })

describe('featuredTopics', () => {
  it('shows everything when nothing is ticked', () => {
    // The state every existing deployment is in the moment the column appears.
    const all = [t('Crude Oil'), t('FX'), t('Precious Metals')]
    assert.deepEqual(featuredTopics(all), all)
  })

  it('shows only what is ticked, once anything is', () => {
    const all = [t('Crude Oil', true), t('FX'), t('Precious Metals', true)]
    assert.deepEqual(
      featuredTopics(all).map((x) => x.name),
      ['Crude Oil', 'Precious Metals'],
    )
  })

  it('honours a single tick rather than falling back', () => {
    // The boundary the fallback must not swallow: one ticked is curation, not emptiness.
    const all = [t('Crude Oil', true), t('FX'), t('Precious Metals')]
    assert.deepEqual(
      featuredTopics(all).map((x) => x.name),
      ['Crude Oil'],
    )
  })

  it('returns nothing for nothing', () => {
    assert.deepEqual(featuredTopics([]), [])
  })
})

describe('featuredIsCurated', () => {
  it('reports whether the operator has chosen', () => {
    assert.equal(featuredIsCurated([t('FX'), t('Crude Oil')]), false)
    assert.equal(featuredIsCurated([t('FX'), t('Crude Oil', true)]), true)
    assert.equal(featuredIsCurated([]), false)
  })
})
