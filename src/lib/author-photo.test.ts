import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  ALLOWED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  describeBytes,
  isAuthorPhotoUrl,
  photoRejectionReason,
} from '@/lib/author-photo'

describe('photoRejectionReason', () => {
  it('accepts the three inert image formats', () => {
    for (const type of ALLOWED_PHOTO_TYPES) {
      assert.equal(photoRejectionReason({ type, size: 2_000_000 }), null, type)
    }
  })

  it('refuses SVG, which is a document that can carry script', () => {
    // These render in an <img> on a public page. Three inert formats cover the need.
    assert.match(photoRejectionReason({ type: 'image/svg+xml', size: 1000 }) ?? '', /JPEG, PNG or WebP/)
  })

  it('refuses a PDF or anything else dressed as a photograph', () => {
    assert.ok(photoRejectionReason({ type: 'application/pdf', size: 1000 }))
    assert.ok(photoRejectionReason({ type: '', size: 1000 }))
  })

  it('names the actual size when a file is too big', () => {
    // The operator can act on "that file is 40.0 MB"; they cannot act on "too large".
    const reason = photoRejectionReason({ type: 'image/jpeg', size: 40 * 1024 * 1024 })
    assert.match(reason ?? '', /40\.0 MB/)
    assert.match(reason ?? '', /15\.0 MB/)
  })

  it('allows a genuinely high-resolution photograph', () => {
    // The whole point of the direct-upload path: a 12 MB portrait must go through.
    assert.equal(photoRejectionReason({ type: 'image/jpeg', size: 12 * 1024 * 1024 }), null)
    assert.equal(photoRejectionReason({ type: 'image/jpeg', size: MAX_PHOTO_BYTES }), null)
  })

  it('refuses an empty file rather than uploading nothing', () => {
    assert.equal(photoRejectionReason({ type: 'image/png', size: 0 }), 'That file is empty.')
  })
})

describe('isAuthorPhotoUrl', () => {
  const ours = 'https://abc123.public.blob.vercel-storage.com/authors/1700-sarah.jpg'

  it('recognises a blob we uploaded', () => {
    assert.ok(isAuthorPhotoUrl(ours))
  })

  it('does not claim somebody else’s URL', () => {
    // This decides whether we delete a file. Claiming a URL we do not own would mean
    // trying to delete somebody else's image when an author's photo is replaced.
    assert.ok(!isAuthorPhotoUrl('https://example.com/authors/sarah.jpg'))
    assert.ok(!isAuthorPhotoUrl('https://abc.public.blob.vercel-storage.com/reports/x.pdf'))
    assert.ok(!isAuthorPhotoUrl('http://abc.public.blob.vercel-storage.com/authors/x.jpg'))
    assert.ok(!isAuthorPhotoUrl('not a url'))
    assert.ok(!isAuthorPhotoUrl(''))
  })
})

describe('describeBytes', () => {
  it('reads the way a person would say it', () => {
    assert.equal(describeBytes(512), '512 B')
    assert.equal(describeBytes(2048), '2 KB')
    assert.equal(describeBytes(5 * 1024 * 1024), '5.0 MB')
  })
})
