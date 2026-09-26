import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isOptimisable } from '@/components/uploaded-image'

/**
 * Which uploads may go through the image optimiser.
 *
 * The consequence of getting this wrong in each direction is asymmetric, which is why it
 * is tested rather than eyeballed. Too strict and our own uploads keep the one-shot
 * browser downscale that made thumbnails look pixelated. Too loose and `remotePatterns`
 * refuses the URL at render time — a broken image where a picture was — or, if
 * `remotePatterns` were widened to match, this deployment becomes an open image proxy.
 */
describe('isOptimisable', () => {
  it('accepts our own Blob store', () => {
    assert.equal(
      isOptimisable('https://abc123.public.blob.vercel-storage.com/sections/1-oil.jpg'),
      true,
    )
  })

  it('refuses another host', () => {
    assert.equal(isOptimisable('https://images.example.com/oil.jpg'), false)
  })

  it('refuses a lookalike hostname', () => {
    // The suffix has to be a real domain boundary. Without the leading dot on the
    // constant, "evilpublic.blob.vercel-storage.com.attacker.test" would pass a naive
    // `includes`, and an attacker-chosen host would be proxied by our optimiser.
    assert.equal(
      isOptimisable('https://public.blob.vercel-storage.com.attacker.test/x.jpg'),
      false,
    )
    assert.equal(isOptimisable('https://notblob.vercel-storage.com/x.jpg'), false)
  })

  it('refuses plain http even on the right host', () => {
    assert.equal(
      isOptimisable('http://abc123.public.blob.vercel-storage.com/sections/1-oil.jpg'),
      false,
    )
  })

  it('refuses something that is not a URL at all', () => {
    // A relative path, or a half-typed value in the paste-a-URL box.
    assert.equal(isOptimisable('/local/oil.jpg'), false)
    assert.equal(isOptimisable(''), false)
    assert.equal(isOptimisable('not a url'), false)
  })
})
