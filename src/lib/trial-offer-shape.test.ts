import assert from 'node:assert/strict'
import { test } from 'node:test'

import { clampTrialDays, itemTrial, offerUsable } from '@/lib/trial-offer-shape'
import { clampDays } from '@/lib/trial-shape'

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

const openItem = {
  trialEnabled: true,
  trialDays: null as number | null,
  archivedAt: null as Date | null,
  kind: 'product' as const,
  section: null as { archivedAt: Date | null } | null,
}

test('a trial is off until the item says otherwise', () => {
  assert.equal(itemTrial({ ...openItem, trialEnabled: false }, 14), null)
})

test('an item with trials on uses the house default', () => {
  assert.deepEqual(itemTrial(openItem, 14), { days: 14 })
})

test('changing the house default moves every item that set no number of its own', () => {
  assert.deepEqual(itemTrial(openItem, 30), { days: 30 })
})

test("an item's own number beats the default", () => {
  assert.deepEqual(itemTrial({ ...openItem, trialDays: 7 }, 30), { days: 7 })
})

test('a stored nonsense day count is clamped, not obeyed', () => {
  assert.deepEqual(itemTrial({ ...openItem, trialDays: 0 }, 14), { days: 1 })
  assert.deepEqual(itemTrial({ ...openItem, trialDays: 99999 }, 14), { days: 365 })
})

test('an archived item offers nothing however its switch is set', () => {
  assert.equal(itemTrial({ ...openItem, archivedAt: new Date() }, 14), null)
})

test('a section archived as a section offers nothing either', () => {
  assert.equal(
    itemTrial({ ...openItem, kind: 'section', section: { archivedAt: new Date() } }, 14),
    null,
  )
})

test('two products can both be open at once — they do not consult each other', () => {
  const ramp = itemTrial({ ...openItem, trialDays: 14 }, 14)
  const terminal = itemTrial({ ...openItem, trialDays: 30 }, 14)
  assert.deepEqual(ramp, { days: 14 })
  assert.deepEqual(terminal, { days: 30 })
})

test('the two day clamps agree, since one is a copy of the other', () => {
  for (const n of [-5, 0, 1, 14, 365, 400, 1e6]) {
    assert.equal(clampTrialDays(n), clampDays(n), `clamp disagreed at ${n}`)
  }
})
