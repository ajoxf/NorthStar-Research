import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { codeExpiringEmail, receiptEmail, welcomeEmail } from '@/lib/notifications/templates'

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

describe('codeExpiringEmail', () => {
  const url = 'https://nordstarpro.com/redeem'

  it('carries the code itself, in both parts', () => {
    // The alternative is asking somebody to go and find an email from a fortnight ago in
    // order to act on this one.
    const email = codeExpiringEmail('NSR-4KFP-9TQX', url, 3, 'Sam')
    assert.ok(email.html.includes('NSR-4KFP-9TQX'), 'HTML part is missing the code')
    assert.ok(email.text.includes('NSR-4KFP-9TQX'), 'text part is missing the code')
    assert.ok(email.html.includes(url) && email.text.includes(url), 'missing the redeem link')
  })

  it('says tomorrow rather than "in 1 days"', () => {
    assert.match(codeExpiringEmail('NSR-A', url, 1).subject, /expires tomorrow$/)
    assert.match(codeExpiringEmail('NSR-A', url, 3).subject, /expires in 3 days$/)
  })

  it('never claims the membership itself is expiring', () => {
    // The paid period starts at redemption, so nothing bought has been lost yet. Wording
    // that implies otherwise turns a helpful nudge into a threat about something the
    // reader already owns.
    const email = codeExpiringEmail('NSR-A', url, 2, 'Sam')
    for (const part of [email.html, email.text, email.subject]) {
      assert.ok(!/membership (expires|has expired|is expiring)/i.test(part), part.slice(0, 120))
    }
    assert.match(email.text, /nothing is lost by activating today/i)
  })

  it('escapes a name rather than interpolating it into the markup', () => {
    const email = codeExpiringEmail('NSR-A', url, 2, '<script>alert(1)</script>')
    assert.ok(!email.html.includes('<script>'), 'a name was interpolated unescaped')
  })
})
