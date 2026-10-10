import 'server-only'

import { db } from '@/lib/db'
import {
  type OfferShape,
  type OfferTarget,
  offerForCode,
  publicOfferFor,
} from '@/lib/offer'

/**
 * Reading offers out of the database.
 *
 * The deciding lives in offer.ts, which is pure and tested; this only fetches rows and
 * turns them into the shape those rules take. The split is the same one browse-filter.ts
 * and browse surfaces have, and it is what lets the pricing rules be tested without a
 * database.
 *
 * **Everything live is loaded at once rather than queried per thing being priced.** There
 * are tens of offers at most, a section page needs to know about offers on its package as
 * well as on itself, and one small query that the pure code then filters is both faster and
 * far easier to reason about than a where-clause encoding the same rules a second time —
 * which is exactly how the two would come to disagree.
 */

const WITH_SCOPE = {
  sections: { select: { sectionId: true } },
  packages: { select: { packageId: true } },
} as const

type OfferRow = {
  id: string
  name: string
  code: string | null
  percentOff: number
  duration: string
  startsAt: Date | null
  endsAt: Date | null
  maxRedemptions: number | null
  appliesToEverything: boolean
  archivedAt: Date | null
  sections: { sectionId: string }[]
  packages: { packageId: string }[]
}

export function toOfferShape(row: OfferRow, redeemedCount = 0): OfferShape {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    percentOff: row.percentOff,
    duration: row.duration === 'forever' ? 'forever' : 'first_payment',
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxRedemptions: row.maxRedemptions,
    redeemedCount,
    appliesToEverything: row.appliesToEverything,
    archivedAt: row.archivedAt,
    sectionIds: row.sections.map((scope) => scope.sectionId),
    packageIds: row.packages.map((scope) => scope.packageId),
  }
}

/**
 * Every offer that has not been archived.
 *
 * Dates are not filtered here. `offerLive` applies the window, and doing it in one place
 * rather than two is what stops a query and a predicate drifting apart about what "ending
 * today" means.
 */
export async function liveOffers(): Promise<OfferShape[]> {
  const [rows, used] = await Promise.all([
    db.offer.findMany({ where: { archivedAt: null }, include: WITH_SCOPE, orderBy: { createdAt: 'desc' } }),
    redemptionCounts(),
  ])
  return rows.map((row) => toOfferShape(row, used[row.id] ?? 0))
}

/** Everything, archived included, for the admin list. */
export async function allOffers(): Promise<OfferShape[]> {
  const [rows, used] = await Promise.all([
    db.offer.findMany({ include: WITH_SCOPE, orderBy: { createdAt: 'desc' } }),
    redemptionCounts(),
  ])
  return rows.map((row) => toOfferShape(row, used[row.id] ?? 0))
}

/**
 * How many times each offer has actually been paid for.
 *
 * Counted from the orders rather than kept as a column somebody has to remember to
 * increment. A stored counter would have to be bumped from the payment webhooks, which are
 * delivered more than once by both providers — so it would drift upwards on every retry and
 * close a capped campaign that had not sold out, with nothing to say why. Counting is
 * idempotent, survives a webhook being missed entirely, and gives the same figure anybody
 * reconciling the books would arrive at.
 *
 * Only paid orders count. A pending order is somebody who opened a checkout page, and
 * holding a discount against them would let a handful of abandoned tabs exhaust a campaign.
 */
async function redemptionCounts(): Promise<Record<string, number>> {
  const rows = await db.checkoutOrder.groupBy({
    by: ['offerId'],
    where: { offerId: { not: null }, status: 'paid' },
    _count: { _all: true },
  })
  const counts: Record<string, number> = {}
  for (const row of rows) {
    if (row.offerId) counts[row.offerId] = row._count._all
  }
  return counts
}

/** The public sale on one thing, or null. One query, for a page that prices one item. */
export async function publicOffer(
  target: OfferTarget,
  now: Date = new Date(),
): Promise<OfferShape | null> {
  return publicOfferFor(await liveOffers(), target, now)
}

/** The offer a buyer's typed code names, or null if it is unknown, over, or for something else. */
export async function offerByCode(
  code: string,
  target: OfferTarget,
  now: Date = new Date(),
): Promise<OfferShape | null> {
  return offerForCode(await liveOffers(), code, target, now)
}

/**
 * Which offer a checkout should actually apply.
 *
 * A code is tried first, and whatever public sale is running is tried alongside it — then
 * the deeper of the two wins. Three failures fold into the same answer on purpose:
 *
 * - **No code typed.** The public sale applies, as it does on the page they came from.
 * - **A code that does not work** (unknown, expired, for something else). They still get
 *   the public sale, which they would have had without typing anything. A bad code must
 *   never cost somebody a discount they already qualified for.
 * - **A code worth less than the sale already running.** The sale wins. Honouring a 10%
 *   code during a 25% sale would charge more *because* they typed something, which is
 *   indefensible however it is explained afterwards.
 *
 * Whether the code was recognised is a separate question, and the caller asks it with
 * {@link offerByCode} if it wants to say so.
 */
export async function offerForCheckout(
  target: OfferTarget,
  code?: string | null,
  now: Date = new Date(),
): Promise<OfferShape | null> {
  const offers = await liveOffers()
  const sale = publicOfferFor(offers, target, now)
  const typed = code ? offerForCode(offers, code, target, now) : null
  if (typed === null) return sale
  if (sale === null) return typed
  return typed.percentOff >= sale.percentOff ? typed : sale
}
