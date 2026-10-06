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
  reports: [],
  reads: 0,
  ...over,
})

const ent = (over: Partial<AuthorWeekInput['entitlements'][number]> = {}) => ({
  sectionId: 'sec_1',
  status: 'active',
  createdAt: beforeWindow,
  renewsAt: afterWindow,
  billingProvider: null,
  stripeSubscriptionId: null,
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

describe('history', () => {
  it('ends with the current week and runs oldest first', () => {
    const week = summariseAuthorWeek(input({ entitlements: [ent()], historyWeeks: 4 }))
    assert.equal(week.history.length, 4)
    assert.equal(week.history[3].to.toISOString(), to.toISOString())
    assert.ok(week.history[0].to < week.history[3].to)
  })

  it('recounts each week from the rows, so a lapse shows in the right week', () => {
    /*
       Live for the first two weeks of a four-week history, gone by the last.

       Mid-week on purpose. A renewal falling exactly on a week boundary is not live at
       that boundary — `live` is measured at the instant the week closes and the
       comparison is strict — so a date chosen on the boundary would be testing that edge
       rather than the trend.
    */
    const lapsedMidway = new Date('2026-09-16T00:00:00Z')
    const week = summariseAuthorWeek(
      input({ entitlements: [ent({ renewsAt: lapsedMidway })], historyWeeks: 4 }),
    )
    assert.deepEqual(
      week.history.map((p) => p.live),
      [1, 1, 0, 0],
    )
  })

  it('does not count a subscription as live before it existed', () => {
    /*
     * The bug that flattens the whole chart. A row created this week satisfies both other
     * tests — active, renewal in the future — at every earlier point as well, so without
     * an existence check eight weeks of history all report today's total and an author
     * who has doubled their readership is shown a straight line.
     */
    const week = summariseAuthorWeek(
      input({ entitlements: [ent({ createdAt: insideWindow })], historyWeeks: 3 }),
    )
    assert.deepEqual(
      week.history.map((p) => p.live),
      [0, 0, 1],
    )
  })

  it('has no week-on-week figure when there is no prior week', () => {
    assert.equal(summariseAuthorWeek(input({ historyWeeks: 1 })).weekOnWeek, null)
  })

  it('reports week-on-week movement in live subscribers', () => {
    const lapsedThisWeek = new Date('2026-09-24T00:00:00Z')
    const week = summariseAuthorWeek(
      input({ entitlements: [ent({ renewsAt: lapsedThisWeek })], historyWeeks: 2 }),
    )
    // Live last week, gone this week.
    assert.equal(week.weekOnWeek, -1)
  })
})

describe('composition', () => {
  it('reads each route back from the columns its granting path fills', () => {
    const week = summariseAuthorWeek(
      input({
        entitlements: [
          ent({ stripeSubscriptionId: 'sub_1' }),
          ent({ billingProvider: 'cregis' }),
          ent(),
          ent({ renewsAt: null }),
        ],
      }),
    )
    assert.deepEqual(week.composition, { card: 1, crypto: 1, code: 1, comp: 1 })
  })

  it('counts only what is live, not what was ever held', () => {
    // An author wants to know what their current book is made of.
    const week = summariseAuthorWeek(
      input({ entitlements: [ent(), ent({ renewsAt: beforeWindow })] }),
    )
    assert.equal(week.composition.code, 1)
  })
})

describe('renewals due', () => {
  it('counts live subscriptions renewing inside thirty days', () => {
    const soon = new Date(to.getTime() + 10 * 86_400_000)
    const later = new Date(to.getTime() + 90 * 86_400_000)
    const week = summariseAuthorWeek(
      input({ entitlements: [ent({ renewsAt: soon }), ent({ renewsAt: later })] }),
    )
    assert.equal(week.renewalsDue, 1)
  })

  it('never counts an open-ended comp, which has no renewal to come due', () => {
    const week = summariseAuthorWeek(input({ entitlements: [ent({ renewsAt: null })] }))
    assert.equal(week.renewalsDue, 0)
  })
})

describe('reports', () => {
  it('orders them by opens, so the best-read is first', () => {
    const week = summariseAuthorWeek(
      input({
        reports: [
          { title: 'Quiet one', publishedAt: insideWindow, opens: 2 },
          { title: 'Best read', publishedAt: insideWindow, opens: 30 },
        ],
      }),
    )
    assert.equal(week.reports[0].title, 'Best read')
  })
})
