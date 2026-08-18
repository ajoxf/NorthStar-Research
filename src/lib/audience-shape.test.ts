import assert from 'node:assert/strict'
import test from 'node:test'

import {
  type AudienceRow,
  audienceCsv,
  classifyAudience,
  countAudience,
  isAudienceState,
  readRate,
} from '@/lib/audience-shape'

test('a view outranks every delivery status', () => {
  // Including failed: a member cannot have read a report they were not sent, so a view
  // beside a failure means the failure was a retry or a mis-recorded provider event.
  for (const status of ['sent', 'delivered', 'opened', 'clicked', 'failed', 'queued', null]) {
    assert.equal(classifyAudience({ hasView: true, deliveryStatus: status }), 'read')
  }
})

test('the states are assigned from the delivery status when nobody read it', () => {
  assert.equal(classifyAudience({ hasView: false, deliveryStatus: 'opened' }), 'opened')
  assert.equal(classifyAudience({ hasView: false, deliveryStatus: 'clicked' }), 'opened')
  assert.equal(classifyAudience({ hasView: false, deliveryStatus: 'delivered' }), 'delivered')
  assert.equal(classifyAudience({ hasView: false, deliveryStatus: 'sent' }), 'delivered')
  assert.equal(classifyAudience({ hasView: false, deliveryStatus: 'queued' }), 'delivered')
  assert.equal(classifyAudience({ hasView: false, deliveryStatus: 'failed' }), 'failed')
  assert.equal(classifyAudience({ hasView: false, deliveryStatus: null }), 'not_sent')
})

test('every member lands in exactly one bucket', () => {
  const rows = [
    { state: 'read' as const },
    { state: 'read' as const },
    { state: 'opened' as const },
    { state: 'delivered' as const },
    { state: 'failed' as const },
    { state: 'not_sent' as const },
  ]
  const counts = countAudience(rows)
  assert.deepEqual(counts, { read: 2, opened: 1, delivered: 1, failed: 1, not_sent: 1 })
  // The totals must reconcile, or a stacked bar drawn from them is longer than its audience.
  assert.equal(Object.values(counts).reduce((sum, n) => sum + n, 0), rows.length)
})

test('the read rate is out of who was actually reached', () => {
  // 2 read, 1 opened, 1 delivered = 4 reached. The failure and the never-sent member
  // never had the chance, so counting them would measure deliverability and list growth
  // rather than whether the research gets read.
  const counts = { read: 2, opened: 1, delivered: 1, failed: 5, not_sent: 10 }
  assert.equal(readRate(counts), 0.5)

  assert.equal(readRate({ read: 0, opened: 0, delivered: 0, failed: 3, not_sent: 2 }), null)
  assert.equal(readRate({ read: 3, opened: 0, delivered: 0, failed: 0, not_sent: 0 }), 1)
})

test('states are validated before being trusted from a URL', () => {
  assert.ok(isAudienceState('read'))
  assert.ok(isAudienceState('not_sent'))
  assert.ok(!isAudienceState('everyone'))
  assert.ok(!isAudienceState(''))
})

test('the CSV survives commas and quotes in a name', () => {
  const rows: AudienceRow[] = [
    {
      memberId: 'm1',
      email: 'sam@example.com',
      name: 'Sam "Sandy" Doe, Jr',
      state: 'read',
      viewedAt: new Date('2026-08-17T09:00:00Z'),
      sentAt: new Date('2026-08-16T09:00:00Z'),
    },
  ]
  const csv = audienceCsv(rows)
  const [header, line] = csv.split('\n')

  assert.equal(header, '"Email","Name","State","Read at","Sent at"')
  assert.ok(line.includes('"Sam ""Sandy"" Doe, Jr"'))
  assert.ok(line.includes('"Read"'))
  assert.ok(line.includes('2026-08-17T09:00:00.000Z'))
})

test('a member who was never sent it has no dates to show', () => {
  const csv = audienceCsv([
    {
      memberId: 'm2',
      email: 'new@example.com',
      name: null,
      state: 'not_sent',
      viewedAt: null,
      sentAt: null,
    },
  ])
  assert.ok(csv.includes('"new@example.com","","Never sent","",""'))
})
