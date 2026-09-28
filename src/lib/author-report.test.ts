import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { summariseAuthorWeek, type AuthorWeekInput } from '@/lib/author-report'

const from = new Date('2026-09-21T00:00:00Z')
const to = new Date('2026-09-28T00:00:00Z')
const beforeWindow = new Date('2026-09-01T00:00:00Z')
const insideWindow = new Date('2026-09-24T00:00:00Z')
const afterWindow = new Date('2026-10-15T00:00:00Z')

const input = (over: Partial<AuthorWeekInput> = {}): AuthorWeekInput => ({
  authorName: 'Dean Rogers',
  from,
  to,
  sections: [{ id: 'sec_1', name: 'Crude Oil' }],
  entitlements: [],
  allAccessReaders: 0,
  reportsPublished: 0,
  reads: 0,
  ...over,
})

const ent = (over: Partial<AuthorWeekInput['entitlements'][number]> = {}) => ({
  sectionId: 'sec_1',
  status: 'active',
  createdAt: beforeWindow,
  renewsAt: afterWindow,
  ...over,
})

describe('live', () => {
  it('counts what was live at the end of the window, not today', () => {
    // A report about last week must say what was true last week, or two people reading it
    // on different days disagree about it.
    const week = summariseAuthorWeek(input({ entitlements: [ent()] }))
    assert.equal(week.totals.live, 1)
  })

  it('counts an open-ended comp as live', () => {
    const week = summariseAuthorWeek(input({ entitlements: [ent({ renewsAt: null })] }))
    assert.equal(week.totals.live, 1)
  })

  it('does not count one that had already run out', () => {
    const week = summariseAuthorWeek(
      input({ entitlements: [ent({ renewsAt: beforeWindow })] }),
    )
    assert.equal(week.totals.live, 0)
  })

  it('does not count a non-active status whatever the date says', () => {
    const week = summariseAuthorWeek(input({ entitlements: [ent({ status: 'cancelled' })] }))
    assert.equal(week.totals.live, 0)
  })
})

describe('started', () => {
  it('counts somebody who began inside the window', () => {
    const week = summariseAuthorWeek(
      input({ entitlements: [ent({ createdAt: insideWindow })] }),
    )
    assert.equal(week.totals.started, 1)
  })

  it('does not count a renewal as a new subscriber', () => {
    /*
     * The case that would quietly inflate the number an author cares about most. A crypto
     * renewal overwrites `startedAt` with the renewal date, so counting from that column
     * would report this row as a brand new subscriber every period — and only for members
     * who pay in crypto, since Stripe renewals preserve it. `createdAt` is written once at
     * signup and never updated, which is why it is the column this reads.
     */
    const week = summariseAuthorWeek(
      input({ entitlements: [ent({ createdAt: beforeWindow, renewsAt: afterWindow })] }),
    )
    assert.equal(week.totals.started, 0)
  })

  it('does not count somebody who began before the window', () => {
    const week = summariseAuthorWeek(input({ entitlements: [ent()] }))
    assert.equal(week.totals.started, 0)
  })
})

describe('lapsed', () => {
  it('counts a renewal date that fell in the window with nothing replacing it', () => {
    const week = summariseAuthorWeek(
      input({ entitlements: [ent({ renewsAt: insideWindow })] }),
    )
    assert.equal(week.totals.lapsed, 1)
  })

  it('does not count one that lapsed and was renewed inside the window', () => {
    // Renewed: still live at the end, so nothing was lost.
    const week = summariseAuthorWeek(
      input({ entitlements: [ent({ renewsAt: afterWindow })] }),
    )
    assert.equal(week.totals.lapsed, 0)
  })

  it('does not count a lapse from an earlier week', () => {
    const week = summariseAuthorWeek(
      input({ entitlements: [ent({ renewsAt: beforeWindow })] }),
    )
    assert.equal(week.totals.lapsed, 0)
  })
})

describe('attribution', () => {
  it('ignores entitlements for a section this author does not own', () => {
    const week = summariseAuthorWeek(
      input({ entitlements: [ent({ sectionId: 'someone-elses' }), ent()] }),
    )
    assert.equal(week.totals.live, 1)
  })

  it('ignores a product entitlement, which has no section', () => {
    const week = summariseAuthorWeek(
      input({ entitlements: [ent({ sectionId: null }), ent()] }),
    )
    assert.equal(week.totals.live, 1)
  })

  it('reports each section separately as well as in total', () => {
    const week = summariseAuthorWeek(
      input({
        sections: [
          { id: 'sec_1', name: 'Crude Oil' },
          { id: 'sec_2', name: 'Precious Metals' },
        ],
        entitlements: [ent(), ent({ sectionId: 'sec_2' }), ent({ sectionId: 'sec_2' })],
      }),
    )
    assert.deepEqual(
      week.sections.map((s) => [s.name, s.live]),
      [
        ['Crude Oil', 1],
        ['Precious Metals', 2],
      ],
    )
    assert.equal(week.totals.live, 3)
  })
})

describe('all-access readers', () => {
  it('is reported beside the subscriber figures and never added to them', () => {
    // Adding them would overstate what the author has sold; omitting them would tell an
    // author with a real readership that nobody reads them.
    const week = summariseAuthorWeek(input({ entitlements: [ent()], allAccessReaders: 40 }))
    assert.equal(week.totals.live, 1)
    assert.equal(week.allAccessReaders, 40)
  })
})

describe('net', () => {
  it('is started minus lapsed, and may be negative', () => {
    const week = summariseAuthorWeek(
      input({
        entitlements: [
          ent({ createdAt: insideWindow }),
          ent({ renewsAt: insideWindow }),
          ent({ renewsAt: insideWindow }),
        ],
      }),
    )
    // One genuinely new, two lapsed.
    assert.equal(week.net, -1)
  })

  it('is zero for a week with no movement', () => {
    assert.equal(summariseAuthorWeek(input({ entitlements: [ent()] })).net, 0)
  })
})
