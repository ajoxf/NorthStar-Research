import 'server-only'

import { db } from '@/lib/db'
import {
  DEFAULT_HOLDBACK_DAYS,
  DEFAULT_SHARE_PERCENT,
  balanceOf,
  earningFor,
  payableAt,
  reversalCents,
  type Balance,
} from '@/lib/earnings'
import { parsePriceCents } from '@/lib/package-shape'

/**
 * Writing and reading the contributor ledger.
 *
 * The arithmetic lives in earnings.ts, which is pure and tested. This fetches rows, decides
 * whose sale it was, and writes what comes back — the same split every other feature here
 * has between deciding and persisting.
 *
 * ## Earnings are posted by sweep, not inline in the webhooks
 *
 * An order reaches `paid` in five different places across the two webhook handlers —
 * renewal paths, first-purchase paths, section and package variants. Posting from each one
 * would be five call sites to keep in step, and a missed one is revenue that silently never
 * reaches a contributor's statement.
 *
 * So instead: {@link postPendingEarnings} finds every paid order with no earning against it
 * and posts them. It is idempotent by a database constraint rather than by a check — one
 * earning per order per author, enforced by a unique index, so a replayed webhook or a
 * doubled render cannot pay twice. That also makes it self-healing: a webhook missed
 * entirely still produces the right ledger the next time anything sweeps.
 *
 * The same instinct as deriving an offer's redemption count from paid orders rather than
 * keeping a counter a webhook has to increment.
 */

/** The share to use when a contributor has no rate of their own. */
async function shareFor(author: { revenueSharePercent: number | null }): Promise<number> {
  return author.revenueSharePercent ?? DEFAULT_SHARE_PERCENT
}

/**
 * Whose sale was this?
 *
 * By who sold it, never by who read it. A membership bought from Dean earns Dean his
 * share whatever the buyer goes on to open — which is both the commercial decision and,
 * conveniently, something the schema can already answer: a section has exactly one author
 * and a package has at most one.
 *
 * Null is house revenue. The legacy all-access membership and any package not attributed
 * to a contributor land here, and they create no ledger entry at all rather than an entry
 * for nobody.
 */
export async function authorIdForOrder(order: {
  sectionId: string | null
  packageId: string | null
}): Promise<string | null> {
  if (order.sectionId) {
    const section = await db.section.findUnique({
      where: { id: order.sectionId },
      select: { authorId: true },
    })
    if (section) return section.authorId
  }
  if (order.packageId) {
    const pkg = await db.package.findUnique({
      where: { id: order.packageId },
      select: { authorId: true },
    })
    if (pkg?.authorId) return pkg.authorId
  }
  return null
}

/**
 * The gross of an order in minor units.
 *
 * `grossCents` when it is there, and the formatted `amount` string parsed when it is not.
 * Every order written before this column existed has only the string, and refusing to post
 * earnings for them would mean a ledger that silently begins midway through trading.
 */
function grossCentsOf(order: { grossCents: number | null; amount: string }): number | null {
  if (order.grossCents !== null) return order.grossCents
  return parsePriceCents(order.amount)
}

export type PostedEarnings = {
  considered: number
  posted: number
  /** Paid orders that belong to no contributor. House revenue, correctly ignored. */
  house: number
  /** Orders whose amount could not be read at all. Reported rather than skipped silently. */
  unreadable: number
}

/**
 * Post an earning for every paid order that has not got one.
 *
 * Safe to call as often as you like: the unique index on (orderId, authorId, kind) is what
 * makes it idempotent, so a double render, a retried webhook and a manual re-run all
 * converge on exactly one entry per sale.
 */
export async function postPendingEarnings(
  options: { limit?: number; now?: Date } = {},
): Promise<PostedEarnings> {
  const now = options.now ?? new Date()

  const orders = await db.checkoutOrder.findMany({
    where: {
      status: 'paid',
      // A live-mode probe by an operator is not a sale. The webhooks already refuse to
      // mint memberships for these; paying a contributor for one would be worse.
      isTest: false,
      ledger: { none: { kind: 'earning' } },
    },
    select: {
      id: true,
      amount: true,
      grossCents: true,
      taxCents: true,
      gatewayFeeCents: true,
      ibFeeCents: true,
      currency: true,
      sectionId: true,
      packageId: true,
      paidAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
    take: options.limit ?? 500,
  })

  const summary: PostedEarnings = {
    considered: orders.length,
    posted: 0,
    house: 0,
    unreadable: 0,
  }

  for (const order of orders) {
    const authorId = await authorIdForOrder(order)
    if (!authorId) {
      summary.house += 1
      continue
    }

    const grossCents = grossCentsOf(order)
    if (grossCents === null) {
      summary.unreadable += 1
      console.error(`[ledger] order ${order.id} has an unreadable amount: ${order.amount}`)
      continue
    }

    const author = await db.author.findUnique({
      where: { id: authorId },
      select: { revenueSharePercent: true },
    })
    if (!author) {
      summary.house += 1
      continue
    }

    const sharePercent = await shareFor(author)
    const earning = earningFor(
      {
        grossCents,
        taxCents: order.taxCents ?? 0,
        gatewayFeeCents: order.gatewayFeeCents ?? 0,
        ibFeeCents: order.ibFeeCents ?? 0,
      },
      sharePercent,
    )

    /*
     * The holdback runs from when the money cleared, not from now. An order posted late —
     * by a missed webhook, or by this sweep running for the first time over old orders —
     * must not restart somebody's thirty days.
     */
    const cleared = order.paidAt ?? order.createdAt

    try {
      await db.ledgerEntry.create({
        data: {
          authorId,
          kind: 'earning',
          amountCents: earning.authorCents,
          currency: order.currency,
          payableAt: payableAt(cleared, DEFAULT_HOLDBACK_DAYS),
          orderId: order.id,
          sharePercent,
          basisCents: earning.netCents,
        },
      })
      summary.posted += 1
    } catch (error) {
      // The unique index doing its job: something else posted this first. Not an error.
      const message = error instanceof Error ? error.message : String(error)
      if (!message.includes('Unique constraint')) throw error
    }
  }

  void now
  return summary
}

/**
 * Record a refund and take back the contributor's share of it.
 *
 * Both in one transaction. A refund written without its reversal leaves a contributor
 * holding a balance for a sale that no longer exists, and that balance is what somebody
 * would withdraw against.
 *
 * The reversal is scaled from the original entry rather than recomputed — see
 * `reversalCents`. It carries no holdback: a reversal that waited thirty days to apply
 * would leave the balance overstated for exactly as long as it takes to pay it out.
 */
export async function recordRefund(input: {
  orderId: string
  amountCents: number
  reason?: string | null
  recordedByMemberId?: string | null
  refundedAt?: Date
}): Promise<{ ok: true; reversedCents: number } | { ok: false; error: string }> {
  const order = await db.checkoutOrder.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      amount: true,
      grossCents: true,
      currency: true,
      status: true,
      ledger: { where: { kind: 'earning' }, select: { id: true, authorId: true, amountCents: true } },
      refunds: { select: { amountCents: true } },
    },
  })
  if (!order) return { ok: false, error: 'No such order.' }
  if (order.status !== 'paid') {
    return { ok: false, error: 'That order was never paid, so there is nothing to refund.' }
  }

  const grossCents = grossCentsOf(order)
  if (grossCents === null) {
    return { ok: false, error: 'That order has no readable amount, so a refund cannot be sized against it.' }
  }

  if (input.amountCents <= 0) return { ok: false, error: 'Enter a refund amount greater than zero.' }

  /*
   * Refunds accumulate. Two half refunds are a full one, and a third would be money the
   * buyer never paid — so the check is against what is left, not against the order.
   */
  const alreadyRefunded = order.refunds.reduce((sum, refund) => sum + refund.amountCents, 0)
  if (alreadyRefunded + input.amountCents > grossCents) {
    const remaining = grossCents - alreadyRefunded
    return {
      ok: false,
      error:
        remaining <= 0
          ? 'This order has already been refunded in full.'
          : `Only ${(remaining / 100).toFixed(2)} is left to refund on this order.`,
    }
  }

  const earning = order.ledger[0] ?? null

  const reversed = await db.$transaction(async (tx) => {
    const refund = await tx.refund.create({
      data: {
        orderId: order.id,
        amountCents: input.amountCents,
        currency: order.currency,
        reason: input.reason ?? null,
        recordedByMemberId: input.recordedByMemberId ?? null,
        refundedAt: input.refundedAt ?? new Date(),
      },
    })

    // House revenue has no contributor entry to reverse. The refund is still recorded —
    // it is a fact about the order either way.
    if (!earning) return 0

    const amountCents = reversalCents(
      { authorCents: earning.amountCents, grossCents },
      input.amountCents,
    )
    if (amountCents === 0) return 0

    await tx.ledgerEntry.create({
      data: {
        authorId: earning.authorId,
        kind: 'reversal',
        amountCents,
        currency: order.currency,
        // No holdback: see the note above.
        payableAt: null,
        orderId: order.id,
        refundId: refund.id,
        note: input.reason ?? null,
        createdByMemberId: input.recordedByMemberId ?? null,
      },
    })
    return amountCents
  })

  return { ok: true, reversedCents: reversed }
}

/** What one contributor has earned, and what of it could be paid today. */
export async function balanceFor(authorId: string, now: Date = new Date()): Promise<Balance> {
  const entries = await db.ledgerEntry.findMany({
    where: { authorId },
    select: { amountCents: true, payableAt: true },
  })
  return balanceOf(entries, now)
}

/** Balances for every contributor at once, so the list is one query rather than N. */
export async function balancesByAuthor(now: Date = new Date()): Promise<Record<string, Balance>> {
  const entries = await db.ledgerEntry.findMany({
    select: { authorId: true, amountCents: true, payableAt: true },
  })
  const grouped = new Map<string, { amountCents: number; payableAt: Date | null }[]>()
  for (const entry of entries) {
    const list = grouped.get(entry.authorId) ?? []
    list.push({ amountCents: entry.amountCents, payableAt: entry.payableAt })
    grouped.set(entry.authorId, list)
  }
  const balances: Record<string, Balance> = {}
  for (const [authorId, list] of grouped) balances[authorId] = balanceOf(list, now)
  return balances
}
