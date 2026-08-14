import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import {
  cregisNonce,
  cregisSign,
  isPaidStatus,
  isUnderpaid,
  signaturesMatch,
  unwrapCallbackOrder,
} from './cregis-protocol'

/**
 * Both bugs these cover were invisible: nothing in a log looks wrong when the signature
 * is malformed or the callback is read off the wrong nesting level. The failure only
 * shows up as "the buyer paid and got nothing".
 */

describe('cregisSign', () => {
  it('sorts keys ascending and prefixes the API key', () => {
    // Hand-computed expectation rather than a snapshot of our own output, so the test
    // fails if the concatenation order or the key prefix ever changes.
    const expected = createHash('md5')
      .update('KEYnonceabc123order_idord_1pid42timestamp1700000000000', 'utf8')
      .digest('hex')

    const actual = cregisSign(
      { pid: 42, order_id: 'ord_1', nonce: 'abc123', timestamp: 1700000000000 },
      'KEY',
    )

    assert.equal(actual, expected)
  })

  it('is order-independent across the input object', () => {
    const a = cregisSign({ b: '2', a: '1', c: '3' }, 'KEY')
    const b = cregisSign({ c: '3', a: '1', b: '2' }, 'KEY')
    assert.equal(a, b)
  })

  it('excludes sign itself, so verification reproduces the signing input', () => {
    const params = { pid: 1, order_id: 'x', nonce: 'aaaaaa' }
    const sign = cregisSign(params, 'KEY')
    assert.equal(cregisSign({ ...params, sign }, 'KEY'), sign)
  })

  it('skips empty, null and undefined values', () => {
    const withEmpties = cregisSign(
      { a: '1', b: '', c: null, d: undefined, e: '2' },
      'KEY',
    )
    assert.equal(withEmpties, cregisSign({ a: '1', e: '2' }, 'KEY'))
  })

  it('changes when the API key changes', () => {
    const params = { a: '1' }
    assert.notEqual(cregisSign(params, 'KEY_A'), cregisSign(params, 'KEY_B'))
  })
})

describe('signaturesMatch', () => {
  it('accepts identical signatures and rejects different ones', () => {
    assert.equal(signaturesMatch('abc123', 'abc123'), true)
    assert.equal(signaturesMatch('abc123', 'abc124'), false)
  })

  it('rejects on length mismatch and on non-string input', () => {
    assert.equal(signaturesMatch('abc', 'abcd'), false)
    assert.equal(signaturesMatch('abc', undefined as unknown as string), false)
  })
})

describe('cregisNonce', () => {
  it('is 6 lowercase alphanumeric characters, as the API requires', () => {
    // The previous implementation used a 13-digit epoch, which the API rejects.
    for (let i = 0; i < 200; i += 1) {
      assert.match(cregisNonce(), /^[a-z0-9]{6}$/)
    }
  })
})

describe('unwrapCallbackOrder', () => {
  it('reads the order from the nested data object', () => {
    // The real shape: pid/nonce/timestamp/sign on the envelope, order under `data`.
    const payload = {
      pid: 42,
      nonce: 'abc123',
      timestamp: 1700000000000,
      sign: 'deadbeef',
      data: { order_id: 'ord_9', status: 'paid', cregis_id: 'CRG-9' },
    }

    assert.deepEqual(unwrapCallbackOrder(payload), {
      status: 'paid',
      orderId: 'ord_9',
      cregisOrderId: 'CRG-9',
    })
  })

  it('does not read the envelope when data is present', () => {
    // Guards the exact regression: an envelope-level read found nothing and silently
    // matched no order, so a paying buyer was never granted access.
    const payload = {
      order_id: 'WRONG',
      status: 'expired',
      data: { order_id: 'ord_right', status: 'paid' },
    }

    const result = unwrapCallbackOrder(payload)
    assert.equal(result.orderId, 'ord_right')
    assert.equal(result.status, 'paid')
  })

  it('falls back to the envelope when there is no data object', () => {
    const result = unwrapCallbackOrder({ order_id: 'ord_flat', status: 'PAID' })
    assert.equal(result.orderId, 'ord_flat')
    assert.equal(result.status, 'paid', 'status is lower-cased')
  })

  it('falls back to the order id when no processor id is supplied', () => {
    assert.equal(unwrapCallbackOrder({ data: { order_id: 'ord_x' } }).cregisOrderId, 'ord_x')
  })

  it('returns an empty order id rather than throwing on a junk payload', () => {
    assert.equal(unwrapCallbackOrder({}).orderId, '')
  })
})

describe('payment status classification', () => {
  it('treats an overpayment as paid — the money arrived', () => {
    assert.equal(isPaidStatus('paid_over'), true)
  })

  it('never treats an underpayment as paid', () => {
    assert.equal(isPaidStatus('paid_partial'), false)
    assert.equal(isUnderpaid('paid_partial'), true)
  })

  it('rejects unknown and empty statuses', () => {
    assert.equal(isPaidStatus(''), false)
    assert.equal(isPaidStatus('pending'), false)
  })
})
