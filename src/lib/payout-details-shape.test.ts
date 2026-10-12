import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { describePayoutDetails, destinationFrom, ibanChecksumOk, maskAccount, validatePayoutDetails } from './payout-details-shape'

describe('ibanChecksumOk', () => {
  it('accepts a real IBAN, spaced or not', () => {
    assert.equal(ibanChecksumOk('GB82 WEST 1234 5698 7654 32'), true)
    assert.equal(ibanChecksumOk('DE89370400440532013000'), true)
  })
  it('rejects a single mistyped digit', () => {
    assert.equal(ibanChecksumOk('GB82WEST12345698765433'), false)
  })
})

describe('validatePayoutDetails', () => {
  it('normalises a bank IBAN and SWIFT', () => {
    const result = validatePayoutDetails({ method: 'bank', holderName: ' Sarah  Khan ', account: 'gb82 west 1234 5698 7654 32', routing: 'westgb2l' })
    assert.deepEqual(result, {
      ok: true,
      value: { method: 'bank', holderName: 'Sarah Khan', account: 'GB82WEST12345698765432', routing: 'WESTGB2L', bankName: null },
    })
  })
  it('refuses an IBAN that fails its checksum, and a malformed SWIFT', () => {
    const bad = validatePayoutDetails({ method: 'bank', holderName: 'Sarah Khan', account: 'GB82WEST12345698765433' })
    assert.equal(bad.ok, false)
    assert.equal(!bad.ok && bad.field, 'account')
    const swift = validatePayoutDetails({ method: 'bank', holderName: 'Sarah Khan', account: '12345678', routing: 'ABC' })
    assert.equal(!swift.ok && swift.field, 'routing')
  })
  it('accepts a local account number that is not an IBAN', () => {
    assert.equal(validatePayoutDetails({ method: 'bank', holderName: 'Ravi P', account: '0012 3456 7890' }).ok, true)
  })
  it('wants an email for PayPal and Wise', () => {
    assert.equal(validatePayoutDetails({ method: 'paypal', holderName: 'Sarah Khan', account: 'not-an-email' }).ok, false)
    const ok = validatePayoutDetails({ method: 'wise', holderName: 'Sarah Khan', account: 'Sarah@Example.com' })
    assert.equal(ok.ok && ok.value.account, 'sarah@example.com')
  })
  it('wants an address and a network for crypto', () => {
    const address = 'TQ3xQm1B9q7cWfZ8kLp2V5yN4hR6sD9fA2'
    assert.equal(validatePayoutDetails({ method: 'crypto', holderName: 'Sarah Khan', account: address }).ok, false)
    assert.equal(validatePayoutDetails({ method: 'crypto', holderName: 'Sarah Khan', account: address, routing: 'USDT on TRON (TRC-20)' }).ok, true)
    assert.equal(validatePayoutDetails({ method: 'crypto', holderName: 'Sarah Khan', account: 'TQ3x Qm1B', routing: 'USDT' }).ok, false)
  })
  it('needs a name on the account', () => {
    const result = validatePayoutDetails({ method: 'paypal', holderName: ' ', account: 'a@b.co' })
    assert.equal(!result.ok && result.field, 'holderName')
  })
})

describe('masking and destination', () => {
  it('shows enough to recognise and no more', () => {
    assert.equal(maskAccount('bank', 'GB82WEST12345698765432'), '••••5432')
    assert.equal(maskAccount('paypal', 'sarah@example.com'), 's•••@example.com')
    assert.equal(maskAccount('crypto', 'TQ3xQm1B9q7cWfZ8kLp2V5yN4hR6sD9fA2'), 'TQ3x…9fA2')
    assert.equal(
      describePayoutDetails({ method: 'bank', account: 'GB82WEST12345698765432', routing: 'WESTGB2L', bankName: 'Barclays' }),
      'Bank transfer · ••••5432 · Barclays',
    )
  })
  it('writes the full details onto a withdrawal', () => {
    assert.equal(
      destinationFrom({ method: 'bank', holderName: 'Sarah Khan', account: 'GB82WEST12345698765432', routing: 'WESTGB2L', bankName: 'Barclays' }),
      'Bank transfer to Sarah Khan; IBAN GB82WEST12345698765432; SWIFT WESTGB2L; Barclays',
    )
    assert.equal(
      destinationFrom({ method: 'crypto', holderName: 'Sarah Khan', account: 'TQ3xQm1B9q7cWfZ8kLp2V5yN4hR6sD9fA2', routing: 'USDT on TRON (TRC-20)', bankName: null }),
      'USDT on TRON (TRC-20): TQ3xQm1B9q7cWfZ8kLp2V5yN4hR6sD9fA2 (Sarah Khan)',
    )
  })
})
