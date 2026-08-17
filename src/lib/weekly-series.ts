/**
 * Bucketing member signups into weeks.
 *
 * Split out from dashboard-stats.ts, which reaches the database, so the date arithmetic
 * can be tested directly — it is the part with an off-by-one waiting in it (Sunday) and
 * the part where skipping an empty week would silently flatter the growth line.
 */

export type WeekPoint = {
  /** Start of the week, Monday. */
  weekStart: Date
  /** Members joined that week. */
  joined: number
  /** Cumulative members at the end of that week. */
  total: number
}

/** Monday 00:00 UTC of the week containing `date`. */
export function weekStart(date: Date): Date {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  )
  // getUTCDay is 0 on Sunday, which belongs to the week that began six days earlier.
  const offset = (start.getUTCDay() + 6) % 7
  start.setUTCDate(start.getUTCDate() - offset)
  return start
}

/**
 * Weekly member growth, with empty weeks present.
 *
 * Gaps are filled deliberately. Plotting only the weeks that had a signup and joining
 * those points draws a straight line across a quiet month, which reads as steady growth —
 * the opposite of what happened.
 */
export function toWeeklySeries(joinDates: Date[], weeks: number, now: Date): WeekPoint[] {
  const firstWeek = weekStart(new Date(now.getTime() - (weeks - 1) * 7 * 24 * 3600 * 1000))

  const counts = new Map<number, number>()
  let before = 0
  for (const date of joinDates) {
    const bucket = weekStart(date).getTime()
    if (bucket < firstWeek.getTime()) {
      // Everyone who joined before the window still counts toward the running total.
      before += 1
      continue
    }
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1)
  }

  const series: WeekPoint[] = []
  let running = before
  for (let index = 0; index < weeks; index += 1) {
    const start = new Date(firstWeek.getTime() + index * 7 * 24 * 3600 * 1000)
    const joined = counts.get(start.getTime()) ?? 0
    running += joined
    series.push({ weekStart: start, joined, total: running })
  }
  return series
}
