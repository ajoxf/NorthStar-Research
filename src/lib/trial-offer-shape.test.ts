import assert from 'node:assert/strict'
import { test } from 'node:test'

import { brandForItem, offerUsable } from '@/lib/trial-offer-shape'

const live = { archivedAt: null, kind: 'product' as const, section: null }

test('a live product is on the shelf', () => {
  assert.equal(offerUsable(live), true)
})

test('no item at all is not an offer', () => {
  assert.equal(offerUsable(null), false)
  assert.equal(offerUsable(undefined), false)
})

test('an archived item is off the shelf', () => {
  assert.equal(offerUsable({ ...live, archivedAt: new Date() }), false)
})

test('a section needs its section row', () => {
  assert.equal(offerUsable({ archivedAt: null, kind: 'section', section: null }), false)
})

test('a live section is on the shelf', () => {
  assert.equal(
    offerUsable({ archivedAt: null, kind: 'section', section: { archivedAt: null } }),
    true,
  )
})

test('a section archived as a section is off the shelf, even with a live item row', () => {
  assert.equal(
    offerUsable({ archivedAt: null, kind: 'section', section: { archivedAt: new Date() } }),
    false,
  )
})

test('software wears the Nexus brand', () => {
  assert.equal(brandForItem('product'), 'nexus')
})

test('research keeps NordStar Pro', () => {
  assert.equal(brandForItem('section'), 'nordstar')
})

test('an unknown kind falls back to NordStar Pro, not to the product brand', () => {
  assert.equal(brandForItem(null), 'nordstar')
  assert.equal(brandForItem(undefined), 'nordstar')
})
