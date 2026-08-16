import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { wasReallyDelivered } from '@/lib/delivery-retry'

/**
 * These cover the bug that made a published report reach nobody.
 *
 * Sends recorded by the console provider — which logs a message and reports success —
 * were treated as real deliveries by the idempotency check. Once a real provider was
 * configured, those rows permanently suppressed the actual send: every publish reported
 * the member as "skipped", and the report could never reach them.
 */
describe('wasReallyDelivered', () => {
  it('does not count a console send as delivered', () => {
    assert.equal(wasReallyDelivered('console'), false)
  })

  it('counts a real provider as delivered', () => {
    assert.equal(wasReallyDelivered('resend'), true)
  })

  it('treats a missing provider as unproven', () => {
    // Rows written before the provider column was populated. Retrying risks a duplicate;
    // not retrying risks silence. A duplicate is the recoverable one.
    assert.equal(wasReallyDelivered(null), false)
    assert.equal(wasReallyDelivered(''), false)
  })

  it('counts an unknown provider as delivered', () => {
    // A future vendor must not be silently re-sent to on every publish just because this
    // list has not been updated. Only known placeholders are retried.
    assert.equal(wasReallyDelivered('postmark'), true)
  })
})
