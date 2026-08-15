import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { receiptEmail, welcomeEmail } from '@/lib/notifications/templates'

/**
 * The two emails a new member gets on day one.
 *
 * Tested for the things that are expensive to get wrong rather than for wording: a
 * receipt missing its reference cannot be reconciled against a payment, and a welcome
 * without a working link is a dead end at the exact moment somebody has just paid.
 */

describe('welcomeEmail', () => {
  it('greets by name when there is one, and warmly when there is not', () => {
    assert.match(welcomeEmail('https://nordstarpro.com/dashboard', 'Sam').html, /Welcome, Sam\./)
    assert.match(welcomeEmail('https://nordstarpro.com/dashboard').html, /Welcome aboard\./)
  })

  it('links into the portal in both the HTML and the plain-text part', () => {
    // Plain text matters: some clients render it, and a text part with no link is a
    // dead end for anyone whose client blocks HTML.
    const url = 'https://nordstarpro.com/dashboard'
    const email = welcomeEmail(url)
    assert.ok(email.html.includes(url), 'HTML part is missing the portal link')
    assert.ok(email.text.includes(url), 'text part is missing the portal link')
  })

  it('states the report cadence it was given', () => {
    assert.match(welcomeEmail('https://x.test/dashboard', null, 3).text, /3 reports land each week/)
  })
})

describe('receiptEmail', () => {
  const details = {
    amount: '199.00',
    currency: 'USD',
    method: 'Card' as const,
    reference: 'cs_test_a1b2c3',
    paidAt: new Date('2026-08-14T10:00:00Z'),
  }

  it('carries every field needed to reconcile the payment', () => {
    const email = receiptEmail(details, 'Sam')
    for (const value of ['199.00', 'USD', 'Card', 'cs_test_a1b2c3', 'August 14, 2026']) {
      assert.ok(email.html.includes(value), `HTML is missing ${value}`)
      assert.ok(email.text.includes(value), `text is missing ${value}`)
    }
  })

  it('puts the amount in the subject, where it is visible without opening', () => {
    assert.equal(receiptEmail(details).subject, 'Your NordStar Pro receipt — USD 199.00')
  })

  it('escapes values rather than trusting them', () => {
    // The reference comes from a payment processor's callback payload.
    const email = receiptEmail({ ...details, reference: '<script>x</script>' })
    assert.ok(!email.html.includes('<script>'), 'unescaped markup reached the HTML')
  })
})
