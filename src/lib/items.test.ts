import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  type ItemEntitlement,
  type MemberAccess,
  grantEndsAt,
  hasItem,
  heldItemIds,
  canReadReport,
  isAllAccess,
} from './entitlements'

const NOW = new Date('2026-06-01T12:00:00Z')

const member = (over: Partial<MemberAccess> = {}): MemberAccess => ({
  role: 'member',
  subscriptionStatus: 'active',
  subscriptionRenewsAt: new Date('2027-01-01T00:00:00Z'),
  ...over,
})

const held = (over: Partial<ItemEntitlement> = {}): ItemEntitlement => ({
  itemId: 'item_ramp',
  status: 'active',
  renewsAt: new Date('2026-12-01T00:00:00Z'),
  ...over,
})

// ---------------------------------------------------------------------------
// The expensive mistake. If this test ever goes green the wrong way, every
// research subscriber on the site is holding Nexus RAMP for nothing.
// ---------------------------------------------------------------------------

test('an all-access research member does NOT get a product for free', () => {
  const research = member() // active legacy membership, no entitlements at all
  assert.equal(isAllAccess(research, NOW), true, 'precondition: they are all-access')
  assert.equal(hasItem(research, [], 'item_ramp', NOW), false)
})

test('all-access still reads research — the legacy rule is untouched', () => {
  const research = member()
  assert.equal(canReadReport(research, { sectionId: 'sec_energy' }, [], NOW), true)
  assert.equal(canReadReport(research, { sectionId: null }, [], NOW), true)
})

test('a product is held only by an entitlement to it', () => {
  assert.equal(hasItem(member(), [held()], 'item_ramp', NOW), true)
  assert.equal(hasItem(member(), [held()], 'item_terminal', NOW), false)
})

test('an admin can open a product, for support', () => {
  assert.equal(hasItem(member({ role: 'admin' }), [], 'item_ramp', NOW), true)
})

test('a lapsed entitlement does not hold the item', () => {
  const lapsed = held({ renewsAt: new Date('2026-01-01T00:00:00Z') })
  assert.equal(hasItem(member(), [lapsed], 'item_ramp', NOW), false)
})

test('an open-ended entitlement never lapses', () => {
  assert.equal(hasItem(member(), [held({ renewsAt: null })], 'item_ramp', NOW), true)
})

test('a pending entitlement is not access', () => {
  assert.equal(hasItem(member(), [held({ status: 'pending' })], 'item_ramp', NOW), false)
})

test('a member with only RAMP holds no research', () => {
  const rampOnly = member({ subscriptionStatus: 'pending', subscriptionRenewsAt: null })
  assert.equal(hasItem(rampOnly, [held()], 'item_ramp', NOW), true)
  assert.equal(canReadReport(rampOnly, { sectionId: 'sec_energy' }, [], NOW), false)
})

test('heldItemIds lists what is live and nothing else', () => {
  const list = [
    held({ itemId: 'item_ramp' }),
    held({ itemId: 'item_energy', renewsAt: null }),
    held({ itemId: 'item_old', renewsAt: new Date('2026-01-01T00:00:00Z') }),
    held({ itemId: null, sectionId: 'sec_not_backfilled' }),
  ]
  assert.deepEqual(heldItemIds(list, NOW), ['item_ramp', 'item_energy'])
})

// ---------------------------------------------------------------------------
// What a code grants
// ---------------------------------------------------------------------------

test('a code with no period grants the package period — what it always meant', () => {
  const monthly = grantEndsAt({ grantsOpenEnded: false, grantMonths: null }, 'month', NOW)
  assert.deepEqual(monthly, new Date('2026-07-01T12:00:00Z'))

  const yearly = grantEndsAt({ grantsOpenEnded: false, grantMonths: null }, 'year', NOW)
  assert.deepEqual(yearly, new Date('2027-06-01T12:00:00Z'))
})

test('a code can carry its own period', () => {
  const quarter = grantEndsAt({ grantsOpenEnded: false, grantMonths: 3 }, 'month', NOW)
  assert.deepEqual(quarter, new Date('2026-09-01T12:00:00Z'))
})

test('a comp code grants open-ended access', () => {
  assert.equal(grantEndsAt({ grantsOpenEnded: true, grantMonths: null }, 'month', NOW), null)
  // The tick wins even if a period was typed first and then the box was checked.
  assert.equal(grantEndsAt({ grantsOpenEnded: true, grantMonths: 3 }, 'month', NOW), null)
})

test('the period runs from redemption, not from minting', () => {
  const redeemedLater = new Date('2026-09-15T09:30:00Z')
  const end = grantEndsAt({ grantsOpenEnded: false, grantMonths: 1 }, 'month', redeemedLater)
  assert.deepEqual(end, new Date('2026-10-15T09:30:00Z'))
})

test('a code redeemed on the 31st lands on a real date', () => {
  // JavaScript rolls 31 February forward rather than throwing. Worth pinning: the
  // alternative is a grant that silently ends on a date nobody chose.
  const end = grantEndsAt({ grantsOpenEnded: false, grantMonths: 1 }, 'month', new Date('2026-01-31T00:00:00Z'))
  assert.deepEqual(end, new Date('2026-03-03T00:00:00Z'))
})
