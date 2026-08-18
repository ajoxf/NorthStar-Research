import assert from 'node:assert/strict'
import test from 'node:test'

import { type ReaderRow, filterReaders, readerCsv } from '@/lib/reader-stats'

const NOW = new Date('2026-08-18T12:00:00Z')
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 3600 * 1000)

function row(partial: Partial<ReaderRow> & { email: string }): ReaderRow {
  return {
    memberId: partial.email,
    name: null,
    status: 'active',
    sent: 10,
    read: 5,
    rate: 0.5,
    lastReadAt: null,
    ...partial,
  }
}

const ROWS: ReaderRow[] = [
  row({ email: 'recent@example.com', lastReadAt: daysAgo(3) }),
  row({ email: 'edge@example.com', lastReadAt: daysAgo(29) }),
  row({ email: 'quiet@example.com', lastReadAt: daysAgo(45) }),
  row({ email: 'never@example.com', read: 0, rate: 0, lastReadAt: null }),
  // Sent nothing yet — neither a reader nor a refuser.
  row({ email: 'brandnew@example.com', sent: 0, read: 0, rate: null, lastReadAt: null }),
]

test('reading means read something lately', () => {
  const emails = filterReaders(ROWS, 'reading', NOW).map((entry) => entry.email)
  assert.deepEqual(emails, ['recent@example.com', 'edge@example.com'])
})

test('gone quiet means read once, but not lately — never the people who never read', () => {
  const emails = filterReaders(ROWS, 'quiet', NOW).map((entry) => entry.email)
  assert.deepEqual(emails, ['quiet@example.com'])

  // The distinction that matters: "no recent read" alone would sweep in everyone who
  // never started, which is a different group needing a different conversation.
  assert.ok(!emails.includes('never@example.com'))
})

test('never read excludes anyone who has not been sent anything', () => {
  const emails = filterReaders(ROWS, 'never', NOW).map((entry) => entry.email)
  assert.deepEqual(emails, ['never@example.com'])
  // A member who joined this morning has not ignored anything.
  assert.ok(!emails.includes('brandnew@example.com'))
})

test('the groups do not overlap, and together cover everyone who was sent something', () => {
  const reading = filterReaders(ROWS, 'reading', NOW).map((entry) => entry.email)
  const quiet = filterReaders(ROWS, 'quiet', NOW).map((entry) => entry.email)
  const never = filterReaders(ROWS, 'never', NOW).map((entry) => entry.email)

  const all = [...reading, ...quiet, ...never]
  assert.equal(new Set(all).size, all.length, 'a member appears in at most one group')
  assert.equal(all.length, ROWS.filter((entry) => entry.sent > 0).length)
})

test('everyone means everyone, including members with nothing sent', () => {
  assert.equal(filterReaders(ROWS, 'all', NOW).length, ROWS.length)
})

test('the CSV writes a missing rate as blank, never as zero', () => {
  const csv = readerCsv([
    row({ email: 'brandnew@example.com', sent: 0, read: 0, rate: null, lastReadAt: null }),
  ])
  const line = csv.split('\n')[1]
  // "0%" would rank a brand-new member alongside someone who ignores everything.
  assert.ok(line.includes('"0","0","",""'))
  assert.ok(!line.includes('0%'))
})

test('the CSV escapes a name containing a comma and quotes', () => {
  const csv = readerCsv([row({ email: 'a@b.com', name: 'Doe, "Jo"', rate: 0.5 })])
  assert.ok(csv.split('\n')[1].includes('"Doe, ""Jo"""'))
  assert.ok(csv.split('\n')[1].includes('"50%"'))
})
