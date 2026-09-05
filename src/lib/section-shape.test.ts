import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  authorByline,
  authorInitials,
  authorInputSchema,
  parseCredentials,
  sectionInputSchema,
  sectionName,
  sectionSlug,
  slugify,
  uniqueSlug,
} from '@/lib/section-shape'

describe('sectionName', () => {
  it('generates "Topic by Author" so the name cannot disagree with its parts', () => {
    assert.equal(
      sectionName({ topic: { name: 'Energy' }, author: { name: 'Sarah Chen' } }),
      'Energy by Sarah Chen',
    )
  })

  it('lets the desk override it', () => {
    assert.equal(
      sectionName({
        displayName: 'The Energy Desk',
        topic: { name: 'Energy' },
        author: { name: 'Sarah Chen' },
      }),
      'The Energy Desk',
    )
  })

  it('falls back when the override is blank or whitespace', () => {
    // An empty string arriving from a cleared form field must not become the name.
    for (const displayName of ['', '   ', null, undefined]) {
      assert.equal(
        sectionName({ displayName, topic: { name: 'Energy' }, author: { name: 'Sarah Chen' } }),
        'Energy by Sarah Chen',
      )
    }
  })
})

describe('slugify', () => {
  it('produces url-safe slugs', () => {
    assert.equal(slugify('Energy & Commodities'), 'energy-commodities')
    assert.equal(slugify('  Options / Crypto  '), 'options-crypto')
    assert.equal(sectionSlug('Energy', 'Sarah Chen'), 'energy-by-sarah-chen')
  })

  it('folds accents so one person cannot become two slugs', () => {
    assert.equal(slugify('Zoë Müller'), 'zoe-muller')
  })

  it('never leaves a leading or trailing hyphen', () => {
    assert.equal(slugify('!!! Energy !!!'), 'energy')
    assert.equal(slugify('—'), '')
  })
})

describe('uniqueSlug', () => {
  it('leaves a free slug alone', () => {
    assert.equal(uniqueSlug('sarah-chen', ['tom-ridley']), 'sarah-chen')
  })

  it('suffixes rather than failing, because two people can share a name', () => {
    assert.equal(uniqueSlug('sarah-chen', ['sarah-chen']), 'sarah-chen-2')
    assert.equal(uniqueSlug('sarah-chen', ['sarah-chen', 'sarah-chen-2']), 'sarah-chen-3')
  })
})

describe('authorByline and initials', () => {
  it('drops the separator when there is no headline', () => {
    assert.equal(
      authorByline({ name: 'Sarah Chen', headline: 'Twenty years on the LME floor.' }),
      'Sarah Chen — Twenty years on the LME floor.',
    )
    assert.equal(authorByline({ name: 'Sarah Chen' }), 'Sarah Chen')
    assert.equal(authorByline({ name: 'Sarah Chen', headline: '  ' }), 'Sarah Chen')
  })

  it('takes first and last initials, and copes with one name', () => {
    assert.equal(authorInitials('Sarah Chen'), 'SC')
    assert.equal(authorInitials('Sarah Jane Chen'), 'SC')
    assert.equal(authorInitials('Prince'), 'PR')
    assert.equal(authorInitials('   '), '?')
  })
})

describe('input validation', () => {
  it('rejects a link that is not http(s)', () => {
    // A javascript: URL in a public profile is a stored XSS vector, and an author page
    // renders these as real anchors.
    const bad = authorInputSchema.safeParse({ name: 'Sarah', websiteUrl: 'javascript:alert(1)' })
    assert.equal(bad.success, false)
    const good = authorInputSchema.safeParse({ name: 'Sarah', websiteUrl: 'https://example.com' })
    assert.equal(good.success, true)
  })

  it('treats a cleared link field as absent rather than as an invalid URL', () => {
    const parsed = authorInputSchema.safeParse({ name: 'Sarah', websiteUrl: '', bio: '' })
    assert.equal(parsed.success, true)
    assert.equal(parsed.success && parsed.data.websiteUrl, undefined)
    assert.equal(parsed.success && parsed.data.bio, undefined)
  })

  it('requires a section to name both a topic and an author', () => {
    assert.equal(sectionInputSchema.safeParse({ priceCents: 4900 }).success, false)
    assert.equal(
      sectionInputSchema.safeParse({ topicId: 't1', authorId: 'a1', priceCents: 4900 }).success,
      true,
    )
  })

  it('holds a section price to the same band as a package price', () => {
    const base = { topicId: 't1', authorId: 'a1' }
    assert.equal(sectionInputSchema.safeParse({ ...base, priceCents: 99 }).success, false)
    assert.equal(sectionInputSchema.safeParse({ ...base, priceCents: 100 }).success, true)
    assert.equal(sectionInputSchema.safeParse({ ...base, priceCents: 100_000_01 }).success, false)
  })
})

describe('parseCredentials', () => {
  it('takes one per line and drops the blanks', () => {
    assert.deepEqual(parseCredentials('CFA\n\n  LME floor, 2004–2019  \n'), [
      'CFA',
      'LME floor, 2004–2019',
    ])
    assert.deepEqual(parseCredentials(''), [])
  })
})
