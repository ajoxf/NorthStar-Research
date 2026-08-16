import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { callbackIpAllowed, clientAddress, parseIpList } from '@/lib/cregis-callback'

describe('parseIpList', () => {
  it('accepts the shapes an operator actually pastes', () => {
    assert.deepEqual(parseIpList('1.2.3.4, 5.6.7.8'), ['1.2.3.4', '5.6.7.8'])
    assert.deepEqual(parseIpList('1.2.3.4\n5.6.7.8\n'), ['1.2.3.4', '5.6.7.8'])
    assert.deepEqual(parseIpList('  1.2.3.4  '), ['1.2.3.4'])
  })

  it('is empty for empty input', () => {
    assert.deepEqual(parseIpList(''), [])
    assert.deepEqual(parseIpList('   \n  '), [])
  })
})

describe('callbackIpAllowed', () => {
  it('permits everything when no allowlist is set', () => {
    // The default. The signature check is what authorises a callback; this is only
    // defence in depth, and an empty list must not lock out the payment processor.
    assert.equal(callbackIpAllowed([], '9.9.9.9'), true)
    assert.equal(callbackIpAllowed([], null), true)
  })

  it('permits a listed address and refuses others', () => {
    assert.equal(callbackIpAllowed(['1.2.3.4'], '1.2.3.4'), true)
    assert.equal(callbackIpAllowed(['1.2.3.4'], '1.2.3.5'), false)
  })

  it('refuses an unknown source once a list exists', () => {
    // Fail closed: with an allowlist configured, an unidentifiable caller is not trusted.
    assert.equal(callbackIpAllowed(['1.2.3.4'], null), false)
  })

  it('ignores surrounding whitespace on the incoming address', () => {
    assert.equal(callbackIpAllowed(['1.2.3.4'], ' 1.2.3.4 '), true)
  })
})

describe('clientAddress', () => {
  it('takes the first entry of x-forwarded-for', () => {
    // The chain is client, then each proxy. Reading the last would give us our own edge.
    const headers = new Headers({ 'x-forwarded-for': '1.2.3.4, 10.0.0.1, 10.0.0.2' })
    assert.equal(clientAddress(headers), '1.2.3.4')
  })

  it('falls back to x-real-ip', () => {
    assert.equal(clientAddress(new Headers({ 'x-real-ip': '5.6.7.8' })), '5.6.7.8')
  })

  it('is null when neither header is present', () => {
    assert.equal(clientAddress(new Headers()), null)
  })
})
