/**
 * What an instructor is owed on a sale, and what the platform keeps.
 *
 * These numbers go to an outside contributor, become the basis of a payment, and will be
 * argued about. So the rules are pure, tested and written down here rather than assembled
 * inside a query or a PDF renderer — the same reason author-report.ts exists, raised a
 * level because this one decides money rather than describing it.
 *
 * ## The four decisions this encodes
 *
 * **Fees come off the top.** Tax, the processor's cut and anything owed to an introducing
 * broker are deducted *before* the split, so instructor and platform each bear their share
 * of what it cost to make the sale. The alternative — charging acquisition to the platform's
 * half — is a defensible business, just a different one, and the difference is large: on a
 * $349 sale at 25% off with 20% tax and a 20% IB fee it is $86.20 to the instructor rather
 * than $107.76. Which is why it is stated here rather than left to whoever reads the code.
 *
 * **Attribution is by who sold it, not by who is read.** A membership bought from Dean
 * earns Dean his share, whatever the buyer goes on to open. Every order already resolves to
 * exactly one author — a section has one, a package has at most one — so this is a lookup
 * rather than an apportionment, and there is no readership formula for anyone to dispute.
 * An order that resolves to no author is house revenue.
 *
 * **Tax is never revenue.** Money collected for a tax authority is held, not earned, and is
 * removed before anything is shared. Treating it as revenue would pay out a slice of a
 * liability.
 *
 * **The split is exact.** The platform takes the remainder rather than its own rounded
 * percentage, so the two halves always sum to the net to the cent. Two independent
 * roundings would lose or invent a cent per sale, and a ledger that does not reconcile is
 * worth nothing however close it is.
 *
 * No `server-only` guard: imported by client components and by `node --test`.
 */

/** The instructor's share when no contract says otherwise. */
export const DEFAULT_SHARE_PERCENT = 50

/** How long an earning is held before it can be withdrawn. See `payableAt`. */
export const DEFAULT_HOLDBACK_DAYS = 30

const DAY_MS = 86_400_000

/**
 * The money facts of one order, in minor units throughout.
 *
 * Integers, like every other amount in this codebase, because the alternative is float
 * arithmetic on money. `gross` is what the buyer was actually charged — the discount has
 * already been applied by the time an order exists, so a discount is not a line here.
 */
export type OrderFinancials = {
  /** Charged to the buyer, discount already applied. */
  grossCents: number
  /**
   * Collected on behalf of a tax authority.
   *
   * Zero until tax capture is wired up, which is honest rather than convenient: with no
   * tax recorded, net equals gross and the split is of the whole amount. The column exists
   * so that turning tax on later changes what this function is handed, not what it does.
   */
  taxCents: number
  /** Kept by the payment processor. */
  gatewayFeeCents: number
  /** Owed to an introducing broker or affiliate on this sale. */
  ibFeeCents: number
}

/**
 * What is actually left to share.
 *
 * Floored at zero. A sale whose fees exceeded its revenue is a loss the platform absorbs,
 * not a debt the instructor owes — and a negative "earning" would quietly net off against
 * other sales in the balance, turning one bad order into a silent deduction from unrelated
 * work.
 */
export function netRevenueCents(financials: OrderFinancials): number {
  const net =
    financials.grossCents -
    financials.taxCents -
    financials.gatewayFeeCents -
    financials.ibFeeCents
  return Math.max(0, net)
}

export type Split = {
  /** The instructor's share. */
  authorCents: number
  /** Everything else. The two always sum to the net exactly. */
  platformCents: number
}

/**
 * Divide the net between instructor and platform.
 *
 * The platform takes the remainder rather than computing its own percentage. Rounding both
 * halves independently is how a ledger ends up a cent short of the money that actually
 * arrived — on a 50/50 split of an odd number, both halves round the same way.
 */
export function splitNet(netCents: number, sharePercent: number): Split {
  const pct = Math.min(100, Math.max(0, sharePercent))
  const authorCents = Math.round((netCents * pct) / 100)
  return { authorCents, platformCents: netCents - authorCents }
}

/** The whole calculation for one order, in the order the decisions are made. */
export function earningFor(financials: OrderFinancials, sharePercent: number): Split & {
  netCents: number
} {
  const netCents = netRevenueCents(financials)
  return { netCents, ...splitNet(netCents, sharePercent) }
}

/**
 * When an earning becomes withdrawable.
 *
 * Counted from when the payment cleared, not from when the entry was written, so a sale
 * posted late by a retried webhook does not restart somebody's clock.
 */
export function payableAt(paidAt: Date, holdbackDays: number = DEFAULT_HOLDBACK_DAYS): Date {
  return new Date(paidAt.getTime() + Math.max(0, holdbackDays) * DAY_MS)
}

/**
 * What a refund takes back from an instructor.
 *
 * **Derived from the original earning, not recomputed from the refund.** Recomputing would
 * apply today's share percentage and today's fees to a sale made under last quarter's
 * terms, so an instructor whose rate had improved would hand back more than they were ever
 * given. Scaling the original keeps a full refund exactly cancelling the original entry,
 * which is the property that lets the ledger reconcile.
 *
 * Returned as a negative number, because that is what gets written: the ledger only ever
 * gains rows, and a reversal is a row that happens to be negative.
 */
export function reversalCents(
  original: { authorCents: number; grossCents: number },
  refundedCents: number,
): number {
  if (original.grossCents <= 0) return 0
  const refunded = Math.min(Math.max(0, refundedCents), original.grossCents)
  // Guarded before the negation, which would otherwise return -0: a value that is equal to
  // zero everywhere except `Object.is`, prints as "-0", and has no business in a ledger.
  if (refunded === 0 || original.authorCents === 0) return 0
  // A full refund cancels exactly, with no rounding in the path at all.
  if (refunded === original.grossCents) return -original.authorCents
  return -Math.round((original.authorCents * refunded) / original.grossCents)
}

/** One row of the ledger, as far as a balance is concerned. */
export type BalanceEntry = {
  /** Positive credits the instructor, negative debits them. */
  amountCents: number
  /** When this became (or becomes) withdrawable. Null is immediate — see below. */
  payableAt: Date | null
}

export type Balance = {
  /** Everything on the ledger, held or not. What they have earned. */
  totalCents: number
  /** What could be paid out today. */
  availableCents: number
  /** Earned but still inside the holdback. */
  heldCents: number
}

/**
 * Add up a ledger.
 *
 * **A null `payableAt` counts as available immediately**, and that is deliberate rather
 * than a default falling out of the type. Payouts, reversals and manual adjustments carry
 * no holdback: a payout has already left, and a reversal that waited thirty days to apply
 * would leave a balance claiming money that had been refunded weeks earlier — which is
 * precisely the balance somebody would withdraw against.
 */
export function balanceOf(entries: BalanceEntry[], now: Date = new Date()): Balance {
  let totalCents = 0
  let availableCents = 0
  for (const entry of entries) {
    totalCents += entry.amountCents
    if (entry.payableAt === null || entry.payableAt.getTime() <= now.getTime()) {
      availableCents += entry.amountCents
    }
  }
  return { totalCents, availableCents, heldCents: totalCents - availableCents }
}

/**
 * Can this withdrawal be paid?
 *
 * Checked against the *available* balance rather than the total, which is the whole purpose
 * of the holdback: money inside it may yet be refunded, and paying it out is how a clawback
 * becomes a debt to chase rather than an entry to write.
 */
export function withdrawable(balance: Balance, requestedCents: number): { ok: true } | { ok: false; reason: string } {
  if (requestedCents <= 0) return { ok: false, reason: 'Enter an amount greater than zero.' }
  if (requestedCents > balance.availableCents) {
    return {
      ok: false,
      reason:
        balance.heldCents > 0
          ? 'That is more than is available. Some of this balance is still inside the holdback period.'
          : 'That is more than this contributor has earned.',
    }
  }
  return { ok: true }
}
