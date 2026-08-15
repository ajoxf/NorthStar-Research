import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { CANONICAL_BASE_URL, defaultBaseUrl } from '@/lib/env'

/**
 * The base-URL fallback.
 *
 * Tested because its failure mode is silent and expensive. Every emailed report link and
 * every Cregis callback URL is derived from this value; if it quietly resolves to
 * localhost in production, links go nowhere and payment callbacks are lost without
 * anything throwing to tell you.
 */
describe('defaultBaseUrl', () => {
  it('uses the real origin in production', () => {
    // The case that matters: APP_BASE_URL unset or misspelled in the dashboard.
    assert.equal(defaultBaseUrl('production'), CANONICAL_BASE_URL)
  })

  it('uses localhost everywhere else', () => {
    for (const env of ['development', 'test', undefined]) {
      assert.equal(defaultBaseUrl(env), 'http://localhost:3000', `failed for ${env}`)
    }
  })
})
