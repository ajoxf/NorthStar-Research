/**
 * The week's subscriber figures for one author.
 *
 * These numbers leave the building. They go to an outside contributor who cannot check
 * them against anything, will reasonably treat them as a statement of what they are owed
 * attention for, and may well forward them. So the counting rules are pure, tested, and
 * written down here rather than assembled inside a PDF renderer where nobody would find
 * them again.
 *
 * **Aggregate only, deliberately.** No member names, no email addresses. An author has no
 * account on this site — see the note on the Author model — and their subscribers are the
 * desk's customers rather than theirs. Handing over a contact list is a decision for a
 * contributor agreement, not a default of a weekly report.
 */

export type AuthorWeekInput = {
  authorName: string
  /** Inclusive start, exclusive end. */
  from: Date
  to: Date
  sections: { id: string; name: string }[]
  /**
   * Every entitlement ever written against this author's sections, live or not. Filtering
   * happens here rather than in the query so the rules are visible and testable.
   */
  entitlements: {
    sectionId: string | null
    status: string
    /**
     * When the row was first written, which is when this member first subscribed.
     *
     * Not `startedAt`, and the difference is the whole reason this field is here. Stripe
     * renewals preserve `startedAt` but crypto renewals overwrite it with the renewal
     * date, so counting "new" from it would report every crypto member as a new
     * subscriber every period — inflating the one figure an author is most likely to act
     * on, and only for one payment rail. `createdAt` is written once and never updated.
     */
    createdAt: Date
    renewsAt: Date | null
  }[]
  /**
   * How many members read this author's work on the all-access membership without holding
   * any of it. Counted separately; see `allAccessReaders` below for why it cannot be
   * folded into the subscriber numbers.
   */
  allAccessReaders: number
  /** Reports of theirs published inside the window. */
  reportsPublished: number
  /** Opens of their reports inside the window, by anyone who could read them. */
  reads: number
}

export type AuthorWeekSection = {
  name: string
  /** Holding it at the end of the window. */
  live: number
  /** Began inside the window. */
  started: number
  /** Ran out inside the window and has not been renewed. */
  lapsed: number
}

export type AuthorWeek = {
  authorName: string
  from: Date
  to: Date
  sections: AuthorWeekSection[]
  totals: { live: number; started: number; lapsed: number }
  allAccessReaders: number
  reportsPublished: number
  reads: number
  /** Net movement across the week. Negative is a losing week, and is shown as one. */
  net: number
}

/** Live at a moment: active, and either open-ended or not yet run out. */
function liveAt(
  entitlement: { status: string; renewsAt: Date | null },
  at: Date,
): boolean {
  if (entitlement.status !== 'active') return false
  if (entitlement.renewsAt === null) return true
  return entitlement.renewsAt.getTime() > at.getTime()
}

function inWindow(date: Date | null, from: Date, to: Date): boolean {
  if (date === null) return false
  const t = date.getTime()
  return t >= from.getTime() && t < to.getTime()
}

/**
 * Turn a week of rows into the figures an author is sent.
 *
 * Three counts per section, and the definitions matter more than the arithmetic:
 *
 * **live** is measured at the *end* of the window, not today. A report covering last week
 * must say what was true last week, or two people reading the same report on different
 * days will disagree about it.
 *
 * **started** counts entitlements whose `startedAt` falls inside the window. A renewal
 * rewrites `startedAt`, so a member who renews would otherwise be counted as new every
 * period — which would quietly inflate the one number an author is most likely to care
 * about. Guarded in `summariseAuthorWeek` by only counting rows that were not already live
 * when the window opened.
 *
 * **lapsed** is a renewal date that fell inside the window with nothing replacing it. Not
 * "status is expired": that status is also written by an operator stopping access by hand,
 * and mixing the two would tell an author they lost a subscriber when in fact the desk
 * removed one.
 */
export function summariseAuthorWeek(input: AuthorWeekInput): AuthorWeek {
  const byId = new Map(input.sections.map((section) => [section.id, section]))

  const sections: AuthorWeekSection[] = input.sections.map((section) => {
    const rows = input.entitlements.filter((e) => e.sectionId === section.id)
    return {
      name: section.name,
      live: rows.filter((e) => liveAt(e, input.to)).length,
      // New, not renewed — see the note on `createdAt` above.
      started: rows.filter((e) => inWindow(e.createdAt, input.from, input.to)).length,
      lapsed: rows.filter(
        (e) => inWindow(e.renewsAt, input.from, input.to) && !liveAt(e, input.to),
      ).length,
    }
  })

  // Rows pointing at a section this author no longer owns are ignored rather than
  // silently attributed: `byId` is the author's own list and nothing else is counted.
  void byId

  const totals = sections.reduce(
    (sum, section) => ({
      live: sum.live + section.live,
      started: sum.started + section.started,
      lapsed: sum.lapsed + section.lapsed,
    }),
    { live: 0, started: 0, lapsed: 0 },
  )

  return {
    authorName: input.authorName,
    from: input.from,
    to: input.to,
    sections,
    totals,
    /*
     * Reported beside the subscriber figures, never added to them.
     *
     * A member on the legacy all-access membership reads this author without holding any
     * of their sections. Adding them in would overstate what the author has sold; leaving
     * them out entirely would tell an author with a real readership that nobody is reading
     * them. Both are wrong, so the report says both numbers and labels them.
     */
    allAccessReaders: input.allAccessReaders,
    reportsPublished: input.reportsPublished,
    reads: input.reads,
    net: totals.started - totals.lapsed,
  }
}
