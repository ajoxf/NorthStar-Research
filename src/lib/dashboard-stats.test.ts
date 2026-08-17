import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { toWeeklySeries, weekStart } from '@/lib/weekly-series'

describe('weekStart', () => {
  it('snaps to the Monday of that week', () => {
    // 2026-08-13 is a Thursday.
    assert.equal(weekStart(new Date('2026-08-13T15:00:00Z')).toISOString(), '2026-08-10T00:00:00.000Z')
  })

  it('treats Sunday as the end of the week that began six days earlier', () => {
    // The classic off-by-one: getUTCDay() is 0 on Sunday, which would otherwise snap
    // forward to the next Monday and put Sunday's signups in the wrong week.
    assert.equal(weekStart(new Date('2026-08-16T23:59:00Z')).toISOString(), '2026-08-10T00:00:00.000Z')
  })

  it('is idempotent on a Monday', () => {
    const monday = new Date('2026-08-10T00:00:00Z')
    assert.equal(weekStart(monday).toISOString(), monday.toISOString())
  })
})

describe('toWeeklySeries', () => {
  const now = new Date('2026-08-13T12:00:00Z')

  it('emits one point per week, including empty ones', () => {
    // A quiet week must be plotted flat. Skipping it and joining the points either side
    // draws a diagonal that reads as steady growth — the opposite of what happened.
    const series = toWeeklySeries([new Date('2026-08-11T00:00:00Z')], 4, now)
    assert.equal(series.length, 4)
    assert.deepEqual(series.map((point) => point.joined), [0, 0, 0, 1])
  })

  it('accumulates the running total', () => {
    const series = toWeeklySeries(
      [new Date('2026-07-27T00:00:00Z'), new Date('2026-08-11T00:00:00Z'), new Date('2026-08-12T00:00:00Z')],
      4,
      now,
    )
    assert.deepEqual(series.map((point) => point.total), [0, 1, 1, 3])
  })

  it('counts members who joined before the window toward the total', () => {
    // Otherwise the chart opens at zero and invents growth that already happened.
    const series = toWeeklySeries([new Date('2020-01-01T00:00:00Z')], 3, now)
    assert.equal(series[0].total, 1)
    assert.equal(series[0].joined, 0)
  })

  it('handles no members at all', () => {
    const series = toWeeklySeries([], 3, now)
    assert.deepEqual(series.map((point) => point.total), [0, 0, 0])
  })
})
