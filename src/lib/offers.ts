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
  redeemedCount: number
  appliesToEverything: boolean
  archivedAt: Date | null
  sections: { sectionId: string }[]
  packages: { packageId: string }[]
}

export function toOfferShape(row: OfferRow): OfferShape {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    percentOff: row.percentOff,
    duration: row.duration === 'forever' ? 'forever' : 'first_payment',
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    maxRedemptions: row.maxRedemptions,
    redeemedCount: row.redeemedCount,
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
  const rows = await db.offer.findMany({
    where: { archivedAt: null },
    include: WITH_SCOPE,
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(toOfferShape)
}

/** Everything, archived included, for the admin list. */
export async function allOffers(): Promise<OfferShape[]> {
  const rows = await db.offer.findMany({ include: WITH_SCOPE, orderBy: { createdAt: 'desc' } })
  return rows.map(toOfferShape)
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
 * Count one use of an offer.
 *
 * An atomic `increment` rather than read-modify-write: two checkouts completing at the same
 * instant would otherwise both read the same count and both write one more than it, so the
 * count would drift below the truth and a capped campaign would run past its cap for ever.
 *
 * **The cap itself is soft, and deliberately so.** It is checked when the offer is applied,
 * not held under a lock, so two buyers arriving together on the fiftieth of fifty can both
 * be told yes. Closing that window means a transaction around the whole checkout including
 * a call to a payment provider, which is a much worse thing to own than occasionally
 * honouring one discount more than intended. `CheckoutOrder.offerId` records every use, so
 * the real figure can always be recovered from the orders.
 */
export async function recordOfferRedemption(offerId: string): Promise<void> {
  await db.offer.update({
    where: { id: offerId },
    data: { redeemedCount: { increment: 1 } },
  })
}
