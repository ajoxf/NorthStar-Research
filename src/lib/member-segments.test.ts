import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isFiltered, parseSegment, segmentHref } from '@/lib/segment-query'

describe('parseSegment', () => {
  it('defaults everything to all', () => {
    const segment = parseSegment({})
    assert.deepEqual(segment, {
      status: 'all',
      source: 'all',
      engagement: 'all',
      tag: null,
      search: null,
    })
  })

  it('ignores values that are not real filters', () => {
    // A hand-edited or stale URL must narrow to nothing rather than error or, worse,
    // reach the database as an unrecognised enum.
    const segment = parseSegment({ status: 'deleted', engagement: 'vibes' })
    assert.equal(segment.status, 'all')
    assert.equal(segment.engagement, 'all')
  })

  it('keeps every filter, so they compose', () => {
    const segment = parseSegment({
      status: 'active',
      source: 'cregis_checkout',
      engagement: 'never_read',
      tag: 'fx',
      q: 'sam',
    })
    assert.equal(segment.status, 'active')
    assert.equal(segment.source, 'cregis_checkout')
    assert.equal(segment.engagement, 'never_read')
    assert.equal(segment.tag, 'fx')
    assert.equal(segment.search, 'sam')
  })

  it('treats blank strings as unset', () => {
    assert.equal(parseSegment({ tag: '   ', q: '' }).tag, null)
  })
})

describe('isFiltered', () => {
  it('is false only when nothing narrows', () => {
    assert.equal(isFiltered(parseSegment({})), false)
    assert.equal(isFiltered(parseSegment({ engagement: 'never_read' })), true)
    assert.equal(isFiltered(parseSegment({ tag: 'fx' })), true)
  })
})

describe('segmentHref', () => {
  it('carries the rest of the segment when one filter changes', () => {
    // The bug this prevents: clicking a second filter silently dropping the first.
    const segment = parseSegment({ status: 'active', tag: 'fx' })
    assert.equal(
      segmentHref(segment, { engagement: 'never_read' }),
      '/admin/members?status=active&engagement=never_read&tag=fx',
    )
  })

  it('drops back to a bare path when nothing is set', () => {
    assert.equal(segmentHref(parseSegment({}), {}), '/admin/members')
  })
})
