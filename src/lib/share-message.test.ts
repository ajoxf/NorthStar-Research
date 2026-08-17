import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { reportInviteUrl, reportShareMessage, whatsappShareUrl } from '@/lib/share-message'

const REPORT = { id: 'rep_123', title: 'Gold holds the weekly pivot' }
const BASE = 'https://nordstarpro.com'

describe('reportInviteUrl', () => {
  it('points at redemption, returning to the report', () => {
    // Not the plain /reports link: sending that to a non-member lands them on a sign-in
    // page with no explanation of what they were sent.
    assert.equal(
      reportInviteUrl(BASE, REPORT.id),
      'https://nordstarpro.com/redeem?next=%2Freports%2Frep_123',
    )
  })

  it('carries an access code when one is given', () => {
    assert.equal(
      reportInviteUrl(BASE, REPORT.id, 'NSR-44JD-YG3B'),
      'https://nordstarpro.com/redeem?code=NSR-44JD-YG3B&next=%2Freports%2Frep_123',
    )
  })

  it('ignores a blank or whitespace-only code', () => {
    const plain = reportInviteUrl(BASE, REPORT.id)
    assert.equal(reportInviteUrl(BASE, REPORT.id, ''), plain)
    assert.equal(reportInviteUrl(BASE, REPORT.id, '   '), plain)
    assert.equal(reportInviteUrl(BASE, REPORT.id, null), plain)
  })
})

describe('reportShareMessage', () => {
  it('is two lines: the title, then the link', () => {
    const message = reportShareMessage(REPORT, BASE)
    assert.equal(
      message,
      'New from NordStar Pro — Gold holds the weekly pivot\n\n' +
        'Read it here: https://nordstarpro.com/redeem?next=%2Freports%2Frep_123',
    )
  })

  it('always carries an openable link', () => {
    // The whole point of the message. A title with no link is a dead share.
    assert.ok(reportShareMessage(REPORT, BASE, 'NSR-1').includes('https://'))
  })
})

describe('whatsappShareUrl', () => {
  it('encodes the message, newlines included', () => {
    // An unencoded newline or & truncates the text WhatsApp receives, which silently
    // drops the link off the end of the message.
    const url = whatsappShareUrl(reportShareMessage(REPORT, BASE, 'NSR-1'))
    assert.ok(url.startsWith('https://wa.me/?text='))
    assert.ok(!url.includes('\n'))
    assert.ok(url.includes('%0A'))
  })

  it('round-trips back to the original message', () => {
    const message = reportShareMessage(REPORT, BASE)
    const decoded = decodeURIComponent(whatsappShareUrl(message).replace('https://wa.me/?text=', ''))
    assert.equal(decoded, message)
  })
})
