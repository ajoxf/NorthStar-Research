import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { authorListable, comingSoonVisible } from '@/lib/section-shape'

describe('comingSoonVisible', () => {
  it('shows the badge for somebody announced with nothing live yet', () => {
    assert.equal(comingSoonVisible({ comingSoon: true, liveSectionCount: 0 }), true)
  })

  it('retires itself the moment their first subject goes live', () => {
    // The whole reason the rule exists: nobody has to remember to switch it off, and the
    // site can never call somebody forthcoming on a page that is selling their work.
    assert.equal(comingSoonVisible({ comingSoon: true, liveSectionCount: 1 }), false)
  })

  it('is off for an ordinary contributor', () => {
    assert.equal(comingSoonVisible({ comingSoon: false, liveSectionCount: 0 }), false)
    assert.equal(comingSoonVisible({ comingSoon: false, liveSectionCount: 3 }), false)
  })
})

describe('authorListable', () => {
  it('lists anybody with a live subject', () => {
    assert.equal(authorListable({ comingSoon: false, liveSectionCount: 1 }), true)
  })

  it('lists somebody deliberately announced', () => {
    assert.equal(authorListable({ comingSoon: true, liveSectionCount: 0 }), true)
  })

  it('hides a half-finished profile nobody has announced', () => {
    // Listing one sends a visitor to a page with nothing on it, which is worse than the
    // person not appearing yet.
    assert.equal(authorListable({ comingSoon: false, liveSectionCount: 0 }), false)
  })
})
