import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  PACKAGE_TRIAL_PREFIX,
  grantableItems,
  packageSlugFromTrial,
  packageTrial,
  packageTrialHeldEver,
  packageTrialSlug,
  type TrialItem,
} from '@/lib/package-trial'

const section = (id: string, overrides: Partial<TrialItem> = {}): TrialItem => ({
  id,
  archivedAt: null,
  kind: 'section',
  section: { id: `sec-${id}`, archivedAt: null },
  ...overrides,
})

describe('package trial slugs', () => {
  it('round-trips a slug through the reserved prefix', () => {
    assert.equal(packageTrialSlug('everything-by-dean'), 'package:everything-by-dean')
    assert.equal(packageSlugFromTrial('package:everything-by-dean'), 'everything-by-dean')
  })

  it('does not claim an item slug that merely looks similar', () => {
    assert.equal(packageSlugFromTrial('everything-by-dean'), null)
    assert.equal(packageSlugFromTrial('packages/energy'), null)
  })

  it('treats a bare prefix as naming nothing', () => {
    assert.equal(packageSlugFromTrial(PACKAGE_TRIAL_PREFIX), null)
    assert.equal(packageSlugFromTrial('package:   '), null)
  })
})

describe('grantableItems', () => {
  it('keeps live sections', () => {
    assert.equal(grantableItems([section('a'), section('b')]).length, 2)
  })

  it('drops products, which this site can no longer open', () => {
    const product: TrialItem = { id: 'p', archivedAt: null, kind: 'product', section: null }
    assert.deepEqual(grantableItems([product]), [])
  })

  it('drops an archived item, and a live item over an archived section', () => {
    const archivedItem = section('a', { archivedAt: new Date() })
    const archivedSection = section('b', { section: { id: 'sec-b', archivedAt: new Date() } })
    assert.deepEqual(grantableItems([archivedItem, archivedSection]), [])
  })

  it('drops a section item with no section row — a half-finished backfill is not an offer', () => {
    assert.deepEqual(grantableItems([section('a', { section: null })]), [])
  })
})

describe('packageTrial', () => {
  const open = { trialEnabled: true, trialDays: null, archivedAt: null, items: [section('a')] }

  it('is closed unless the switch is on', () => {
    assert.equal(packageTrial({ ...open, trialEnabled: false }, 14), null)
  })

  it('falls back to the house default, so changing it moves every package without a number', () => {
    assert.deepEqual(packageTrial(open, 21), { days: 21 })
  })

  it('prefers the package’s own number, clamped', () => {
    assert.deepEqual(packageTrial({ ...open, trialDays: 30 }, 14), { days: 30 })
    assert.deepEqual(packageTrial({ ...open, trialDays: 0 }, 14), { days: 1 })
    assert.deepEqual(packageTrial({ ...open, trialDays: 100_000 }, 14), { days: 365 })
  })

  it('is closed for a withdrawn package', () => {
    assert.equal(packageTrial({ ...open, archivedAt: new Date() }, 14), null)
  })

  it('is closed when nothing inside it can be opened', () => {
    assert.equal(packageTrial({ ...open, items: [] }, 14), null)
    const product: TrialItem = { id: 'p', archivedAt: null, kind: 'product', section: null }
    assert.equal(packageTrial({ ...open, items: [product] }, 14), null)
  })

  it('is closed for a missing package rather than throwing', () => {
    assert.equal(packageTrial(null, 14), null)
    assert.equal(packageTrial(undefined, 14), null)
  })
})

describe('packageTrialHeldEver', () => {
  const items = [section('energy'), section('commodities')]

  it('is false for somebody who has held none of it', () => {
    assert.equal(packageTrialHeldEver(items, [], []), false)
  })

  it('refuses when ANY part is already held — overlapping bundles must not stack', () => {
    // The whole point: "Everything by Dean" and "Energy only" share the Energy section, so
    // trialling one must not leave the other open as a second free run at the same thing.
    assert.equal(packageTrialHeldEver(items, ['energy'], []), true)
  })

  it('counts an entitlement that carries only a section, from before items existed', () => {
    assert.equal(packageTrialHeldEver(items, [], ['sec-energy']), true)
  })

  it('is not fooled by holding something outside the package', () => {
    assert.equal(packageTrialHeldEver(items, ['crypto'], ['sec-crypto']), false)
  })
})
