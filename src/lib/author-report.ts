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
    /** Which route it came in by, for the composition breakdown. */
    billingProvider: string | null
    stripeSubscriptionId: string | null
  }[]
  /**
   * How many members read this author's work on the all-access membership without holding
   * any of it. Counted separately; see `allAccessReaders` below for why it cannot be
   * folded into the subscriber numbers.
   */
  allAccessReaders: number
  /** Their reports published inside the window, with how often each was opened. */
  reports: { title: string; publishedAt: Date; opens: number }[]
  /** Opens of any of their reports inside the window, including older editions. */
  reads: number
  /** How many weeks of history to draw, the current one included. */
  historyWeeks?: number
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

/** One earlier week, for the trend. */
export type AuthorWeekPoint = {
  to: Date
  live: number
  started: number
  lapsed: number
}

/**
 * Where this author's subscribers came in by.
 *
 * Read back from the columns each granting path fills rather than stored, exactly as the
 * admin does it — see `accessSource` in access-view.ts. Told to an author because "eleven
 * of your fourteen came in on a code" is a different business from eleven card
 * subscriptions, and only one of them renews by itself.
 */
export type AuthorComposition = {
  card: number
  crypto: number
  code: number
  comp: number
}

export type AuthorWeek = {
  authorName: string
  from: Date
  to: Date
  sections: AuthorWeekSection[]
  totals: { live: number; started: number; lapsed: number }
  allAccessReaders: number
  reports: { title: string; publishedAt: Date; opens: number }[]
  reads: number
  /** Net movement across the week. Negative is a losing week, and is shown as one. */
  net: number
  /** Oldest first, the current week last. */
  history: AuthorWeekPoint[]
  /** Change in live subscribers against the week before. Null with no prior week. */
  weekOnWeek: number | null
  composition: AuthorComposition
  /** Live subscriptions whose renewal falls in the next 30 days. */
  renewalsDue: number
}

/**
 * Live at a moment: it existed by then, is active, and had not run out.
 *
 * **The existence check is not redundant.** Without it a subscription bought yesterday
 * counts as live at every earlier point too, because the only other tests are a status
 * and a future renewal date — both of which a new row satisfies. That is invisible in the
 * current week's figure, where everything has been created by now, and it flattens the
 * trend completely: eight weeks of history all report today's total, so an author who has
 * doubled their readership is shown a straight line.
 */
function liveAt(
  entitlement: { status: string; createdAt: Date; renewsAt: Date | null },
  at: Date,
): boolean {
  if (entitlement.createdAt.getTime() > at.getTime()) return false
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

  const totals = sections.reduce(
    (sum, section) => ({
      live: sum.live + section.live,
      started: sum.started + section.started,
      lapsed: sum.lapsed + section.lapsed,
    }),
    { live: 0, started: 0, lapsed: 0 },
  )

  /*
   * The trend, computed from the same rows rather than from stored snapshots.
   *
   * Every week is recounted from the entitlement table each time the report is made, so a
   * correction — a refund, an entitlement stopped by hand — shows up in the history
   * instead of being frozen into a figure nobody can revise. The cost is that an old
   * report and a new one can disagree about the same week; the alternative is a stored
   * number that is wrong for ever.
   */
  const weeks = Math.max(1, input.historyWeeks ?? 8)
  const span = input.to.getTime() - input.from.getTime()
  const history: AuthorWeekPoint[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const to = new Date(input.to.getTime() - i * span)
    const from = new Date(to.getTime() - span)
    const rows = input.entitlements.filter((e) => e.sectionId !== null && byId.has(e.sectionId))
    history.push({
      to,
      live: rows.filter((e) => liveAt(e, to)).length,
      started: rows.filter((e) => inWindow(e.createdAt, from, to)).length,
      lapsed: rows.filter((e) => inWindow(e.renewsAt, from, to) && !liveAt(e, to)).length,
    })
  }

  const previous = history.length > 1 ? history[history.length - 2] : null

  /*
   * Composition, read back from the columns each granting path fills.
   *
   * The same reading the admin does — a Stripe subscription id is proof, a provider alone
   * means crypto, and a row with neither is a code or a comp told apart by whether
   * anything is owed. Only live rows are counted: an author wants to know what their
   * current book is made of, not what it was ever made of.
   */
  const liveRows = input.entitlements.filter(
    (e) => e.sectionId !== null && byId.has(e.sectionId) && liveAt(e, input.to),
  )
  const composition: AuthorComposition = { card: 0, crypto: 0, code: 0, comp: 0 }
  for (const row of liveRows) {
    if (row.stripeSubscriptionId || row.billingProvider === 'stripe') composition.card += 1
    else if (row.billingProvider === 'cregis') composition.crypto += 1
    else if (row.renewsAt === null) composition.comp += 1
    else composition.code += 1
  }

  /*
   * What is up for renewal soon.
   *
   * The most actionable number in the report: these are the subscriptions that will
   * either renew or lapse in the next month, and the weeks before that is when an author
   * can do anything about it. Thirty days rather than the report's own window, because a
   * week's notice is not enough to act on.
   */
  const soon = new Date(input.to.getTime() + 30 * 86_400_000)
  const renewalsDue = liveRows.filter(
    (e) => e.renewsAt !== null && e.renewsAt.getTime() <= soon.getTime(),
  ).length

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
    reports: [...input.reports].sort((a, b) => b.opens - a.opens),
    reads: input.reads,
    net: totals.started - totals.lapsed,
    history,
    weekOnWeek: previous === null ? null : totals.live - previous.live,
    composition,
    renewalsDue,
  }
}
