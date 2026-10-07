import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  MAX_PERCENT_OFF,
  discountedCents,
  normaliseOfferCode,
  offerCovers,
  offerForCode,
  offerLive,
  priceWithOffer,
  publicOfferFor,
  type OfferShape,
} from '@/lib/offer'

const now = new Date('2026-03-15T12:00:00Z')
const earlier = new Date('2026-03-01T00:00:00Z')
const later = new Date('2026-04-01T00:00:00Z')

const offer = (over: Partial<OfferShape> = {}): OfferShape => ({
  id: 'off_1',
  name: 'Launch week',
  code: null,
  percentOff: 25,
  duration: 'first_payment',
  startsAt: null,
  endsAt: null,
  maxRedemptions: null,
  redeemedCount: 0,
  appliesToEverything: false,
  archivedAt: null,
  sectionIds: ['sec_1'],
  packageIds: [],
  ...over,
})

describe('discountedCents', () => {
  it('takes a quarter off a price that divides evenly', () => {
    assert.equal(discountedCents(34_900, 25), 26_175)
  })

  it('rounds to the nearest cent rather than carrying a fraction', () => {
    // 19900 * 0.67 = 13333.0 exactly; 9999 at 25% is 7499.25, which must land on a cent.
    assert.equal(discountedCents(9_999, 25), 7_499)
  })

  it('charges the list price at nothing off', () => {
    assert.equal(discountedCents(34_900, 0), 34_900)
  })

  it('never charges more than the list price or less than nothing', () => {
    // A stored percentage outside the allowed range is a bug; one that charged a negative
    // amount, or more than the thing costs, would be a far worse one.
    assert.equal(discountedCents(34_900, -50), 34_900)
    assert.equal(discountedCents(34_900, 150), 0)
  })

  it('stays in whole cents, because every rail bills integers', () => {
    for (const pct of [1, 7, 13, 25, 33, 99]) {
      assert.ok(Number.isInteger(discountedCents(34_900, pct)))
    }
  })
})

describe('offerLive', () => {
  it('is live with no window set at all', () => {
    assert.equal(offerLive(offer(), now), true)
  })

  it('is not live before it starts', () => {
    assert.equal(offerLive(offer({ startsAt: later }), now), false)
  })

  it('is not live once it has ended', () => {
    assert.equal(offerLive(offer({ endsAt: earlier }), now), false)
  })

  it('ends exclusively, so an offer ending now is already over', () => {
    assert.equal(offerLive(offer({ endsAt: now }), now), false)
  })

  it('is off when archived, whatever the dates say', () => {
    // The operator's stop button. One that argued with a date would be no use.
    assert.equal(offerLive(offer({ archivedAt: earlier, endsAt: later }), now), false)
  })

  it('stops at the redemption ceiling', () => {
    assert.equal(offerLive(offer({ maxRedemptions: 10, redeemedCount: 10 }), now), false)
    assert.equal(offerLive(offer({ maxRedemptions: 10, redeemedCount: 9 }), now), true)
  })

  it('does not stop when the ceiling is uncapped', () => {
    assert.equal(offerLive(offer({ maxRedemptions: null, redeemedCount: 9_999 }), now), true)
  })
})

describe('offerCovers', () => {
  it('covers a section it names', () => {
    assert.equal(offerCovers(offer(), { sectionId: 'sec_1' }), true)
  })

  it('does not cover a section it does not name', () => {
    assert.equal(offerCovers(offer(), { sectionId: 'sec_2' }), false)
  })

  it('covers a package it names', () => {
    assert.equal(
      offerCovers(offer({ sectionIds: [], packageIds: ['pkg_1'] }), { packageId: 'pkg_1' }),
      true,
    )
  })

  it('covers everything when told to explicitly', () => {
    assert.equal(
      offerCovers(offer({ sectionIds: [], appliesToEverything: true }), { sectionId: 'any' }),
      true,
    )
  })

  it('covers NOTHING when nothing was chosen', () => {
    /*
     * The test that matters most in this file. "No scope means everything" is the shape of
     * the empty-package bug — a package with no items read as granting all-access, so an
     * operator who saved before ticking the contents gave away the whole site. The same
     * inference here would discount it. Forgetting to choose must cost a sale that did not
     * happen, never revenue on every sale that did.
     */
    const forgotten = offer({ sectionIds: [], packageIds: [], appliesToEverything: false })
    assert.equal(offerCovers(forgotten, { sectionId: 'sec_1' }), false)
    assert.equal(offerCovers(forgotten, { packageId: 'pkg_1' }), false)
    assert.equal(offerCovers(forgotten, {}), false)
  })
})

describe('publicOfferFor', () => {
  it('finds a live public sale on this section', () => {
    const found = publicOfferFor([offer()], { sectionId: 'sec_1' }, now)
    assert.equal(found?.id, 'off_1')
  })

  it('never returns a coded offer', () => {
    /*
     * The leak this split exists to prevent. A code is a discount for the people who were
     * sent it; surfacing it as a public price hands it to everybody, and the campaign is
     * over before anyone notices it began.
     */
    const coded = offer({ id: 'off_coded', code: 'LAUNCH25' })
    assert.equal(publicOfferFor([coded], { sectionId: 'sec_1' }, now), null)
  })

  it('ignores one that has expired', () => {
    assert.equal(publicOfferFor([offer({ endsAt: earlier })], { sectionId: 'sec_1' }, now), null)
  })

  it('takes the deepest discount when two apply', () => {
    // A buyer shown two prices takes the lower one, and being the party that charged more
    // is not a position to defend.
    const found = publicOfferFor(
      [offer({ id: 'a', percentOff: 10 }), offer({ id: 'b', percentOff: 40 })],
      { sectionId: 'sec_1' },
      now,
    )
    assert.equal(found?.id, 'b')
  })

  it('credits the more specific campaign when two offer the same cut', () => {
    // Same price either way, so this only decides which campaign gets the sale — and the
    // one aimed at this section is the better answer than the one aimed at everything.
    const found = publicOfferFor(
      [
        offer({ id: 'site', sectionIds: [], appliesToEverything: true }),
        offer({ id: 'this-one', sectionIds: ['sec_1'] }),
      ],
      { sectionId: 'sec_1' },
      now,
    )
    assert.equal(found?.id, 'this-one')
  })

  it('returns null when nothing is running', () => {
    assert.equal(publicOfferFor([], { sectionId: 'sec_1' }, now), null)
  })
})

describe('offerForCode', () => {
  const coded = offer({ id: 'off_code', code: 'LAUNCH25' })

  it('finds the offer a code names', () => {
    assert.equal(offerForCode([coded], 'LAUNCH25', { sectionId: 'sec_1' }, now)?.id, 'off_code')
  })

  it('does not care about case or stray spaces', () => {
    // Somebody retyping a code from an email gets it wrong in exactly these two ways.
    assert.equal(offerForCode([coded], '  launch25 ', { sectionId: 'sec_1' }, now)?.id, 'off_code')
  })

  it('refuses a code for a different section', () => {
    assert.equal(offerForCode([coded], 'LAUNCH25', { sectionId: 'sec_2' }, now), null)
  })

  it('refuses an expired code', () => {
    const stale = offer({ code: 'LAUNCH25', endsAt: earlier })
    assert.equal(offerForCode([stale], 'LAUNCH25', { sectionId: 'sec_1' }, now), null)
  })

  it('refuses a code nobody issued', () => {
    assert.equal(offerForCode([coded], 'NOPE', { sectionId: 'sec_1' }, now), null)
  })

  it('refuses an empty string, which is what a blank box sends', () => {
    assert.equal(offerForCode([coded], '   ', { sectionId: 'sec_1' }, now), null)
  })

  it('never matches a public sale, which has no code to type', () => {
    assert.equal(offerForCode([offer()], '', { sectionId: 'sec_1' }, now), null)
  })
})

describe('priceWithOffer', () => {
  it('reports both numbers, so a surface can strike one through', () => {
    // The saving is the part that persuades anybody. A sale price shown on its own is
    // indistinguishable from a price cut.
    const priced = priceWithOffer(34_900, offer())
    assert.deepEqual(priced, {
      listCents: 34_900,
      chargeCents: 26_175,
      offerId: 'off_1',
      percentOff: 25,
      duration: 'first_payment',
    })
  })

  it('leaves the price alone when nothing applies', () => {
    const priced = priceWithOffer(34_900, null)
    assert.equal(priced.chargeCents, 34_900)
    assert.equal(priced.listCents, 34_900)
    assert.equal(priced.offerId, null)
  })

  it('carries the duration through, because renewal is a different promise', () => {
    const priced = priceWithOffer(34_900, offer({ duration: 'forever' }))
    assert.equal(priced.duration, 'forever')
  })

  it('still charges something at the deepest discount allowed', () => {
    // 100% off is a comp, which is a gifted code and a different operation entirely — so
    // the most an offer can do must still leave an amount a payment rail can settle.
    const priced = priceWithOffer(34_900, offer({ percentOff: MAX_PERCENT_OFF }))
    assert.ok(priced.chargeCents > 0)
  })
})

describe('normaliseOfferCode', () => {
  it('does not mangle a campaign code the way the grant-code rule would', () => {
    /*
     * `normaliseCode` in codes.ts reformats any eight-character input into NSR-XXXX-XXXX,
     * which turns LAUNCH25 into NSR-LAUN-CH25 and then finds nothing. Campaign codes are
     * free text somebody chose, so case and surrounding space is the only safe change.
     */
    assert.equal(normaliseOfferCode(' launch25 '), 'LAUNCH25')
  })
})
