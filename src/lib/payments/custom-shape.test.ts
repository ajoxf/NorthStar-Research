import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { describe, it } from 'node:test'

import { customIdFor, validateCustom } from '@/lib/payments/custom-shape'
import { fillPayUrl, parseCustomWebhook, signatureValid } from '@/lib/payments/gateways/custom'

describe('customIdFor', () => {
  it('slugs the name and stays unique', () => {
    assert.equal(customIdFor('Ziina Pay', []), 'custom-ziina-pay')
    assert.equal(customIdFor('Ziina Pay', ['custom-ziina-pay']), 'custom-ziina-pay-2')
    assert.equal(customIdFor('***', []), 'custom-provider')
  })
})

describe('validateCustom', () => {
  it('needs a name and a way to pay', () => {
    assert.equal(validateCustom({ name: '' }).ok, false)
    assert.equal(validateCustom({ name: 'Ziina' }).ok, false)
  })
  it('accepts an https link with known placeholders and defaults the button text', () => {
    const result = validateCustom({ name: 'Ziina', payUrl: 'https://pay.ziina.com/x?amount={amount}&ref={order_number}', currencies: 'aed, usd' })
    assert.ok(result.ok)
    if (result.ok) {
      assert.equal(result.value.label, 'Pay with Ziina')
      assert.deepEqual(result.value.currencies, ['AED', 'USD'])
    }
  })
  it('refuses http, unknown placeholders and bad currencies', () => {
    assert.equal(validateCustom({ name: 'A', payUrl: 'http://x.test' }).ok, false)
    assert.equal(validateCustom({ name: 'A', payUrl: 'https://x.test/{total}' }).ok, false)
    assert.equal(validateCustom({ name: 'A', instructions: 'Bank', currencies: 'DOLLARS' }).ok, false)
  })
})

describe('payment links', () => {
  it('fills placeholders, URL-encoded', () => {
    const url = fillPayUrl('https://pay.test/?a={amount}&n={order_number}&e={email}', {
      amountMinor: 12900,
      currency: 'AED',
      orderNumber: 1042,
      orderId: 'cabc',
      email: 'a+b@x.test',
    })
    assert.equal(url, 'https://pay.test/?a=129.00&n=1042&e=a%2Bb%40x.test')
  })
})

describe('custom webhook', () => {
  const secret = 'whsec-test-123'
  const sign = (body: string) => createHmac('sha256', secret).update(body).digest('hex')

  it('checks the signature, with or without the sha256= prefix', () => {
    const body = '{"order_number":7,"status":"paid"}'
    assert.equal(signatureValid(body, sign(body), secret), true)
    assert.equal(signatureValid(body, `sha256=${sign(body)}`, secret), true)
    assert.equal(signatureValid(body, sign(body + ' '), secret), false)
    assert.equal(signatureValid(body, null, secret), false)
  })
  it('turns a signed paid status into a payment for that order number', () => {
    const body = '{"order_number":7,"status":"paid","reference":"T-1"}'
    const [event] = parseCustomWebhook('custom-ziina', body, { signature: sign(body), eventId: null }, secret)
    assert.equal(event.type, 'payment.succeeded')
    assert.equal('orderId' in event && event.orderId, '#7')
    assert.equal(event.eventId, '#7:paid:T-1')
  })
  it('refuses a bad signature, no secret, and malformed orders', () => {
    const body = '{"order_number":7,"status":"paid"}'
    assert.throws(() => parseCustomWebhook('c', body, { signature: 'nope', eventId: null }, secret))
    assert.throws(() => parseCustomWebhook('c', body, { signature: sign(body), eventId: null }, undefined))
    const bad = '{"order_id":"../../etc","status":"paid"}'
    assert.throws(() => parseCustomWebhook('c', bad, { signature: sign(bad), eventId: null }, secret))
    const word = '{"order_number":"seven","status":"paid"}'
    assert.throws(() => parseCustomWebhook('c', word, { signature: sign(word), eventId: null }, secret))
  })
  it('ignores statuses it does not know', () => {
    const body = '{"order_number":7,"status":"pending"}'
    assert.equal(parseCustomWebhook('c', body, { signature: sign(body), eventId: 'e1' }, secret)[0].type, 'ignored')
  })
})
