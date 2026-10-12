import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { acceptableExpertPhoto, profileChanges, profileClaim, type ProfileFields } from './expert-profile-shape'

const live: ProfileFields = {
  headline: 'Twenty years on the LME floor',
  bio: 'Metals analyst.',
  photoUrl: 'https://abc.public.blob.vercel-storage.com/authors/sarah.jpg',
  credentials: ['CFA'],
  websiteUrl: null,
  linkedinUrl: null,
  xUrl: null,
}

describe('profileChanges', () => {
  it('lists only what differs, treating blank as absent', () => {
    const changes = profileChanges(live, { ...live, bio: 'Metals and energy analyst.', websiteUrl: '  ', credentials: ['CFA', 'CMT'] })
    assert.deepEqual(
      changes.map((change) => [change.field, change.before, change.after]),
      [
        ['bio', 'Metals analyst.', 'Metals and energy analyst.'],
        ['credentials', 'CFA', 'CFA\nCMT'],
      ],
    )
  })
  it('is empty when nothing changed', () => {
    assert.deepEqual(profileChanges(live, { ...live, credentials: ['CFA'] }), [])
  })
})

describe('acceptableExpertPhoto', () => {
  it('allows none, the live one, or their own upload', () => {
    assert.equal(acceptableExpertPhoto(null, live.photoUrl), true)
    assert.equal(acceptableExpertPhoto(live.photoUrl, live.photoUrl), true)
    assert.equal(acceptableExpertPhoto('https://abc.public.blob.vercel-storage.com/expert-photos/me-x1.jpg', live.photoUrl), true)
  })
  it('refuses a pasted address or the admin area', () => {
    assert.equal(acceptableExpertPhoto('https://tracker.example.com/pixel.gif', live.photoUrl), false)
    assert.equal(acceptableExpertPhoto('https://abc.public.blob.vercel-storage.com/authors/someone-else.jpg', live.photoUrl), false)
  })
})

describe('profileClaim', () => {
  it('flags a promise of returns anywhere in the text', () => {
    assert.match(profileClaim({ ...live, credentials: ['Averaged 40% a year'] }) ?? '', /percentage/)
    assert.equal(profileClaim(live), null)
  })
})
