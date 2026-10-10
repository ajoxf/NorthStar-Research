import type { Metadata } from 'next'

import { EarningsManager, WithdrawalsLink } from '@/app/admin/earnings/earnings-manager'
import { Eyebrow } from '@/components/band'
import { refundedFromPortion } from '@/lib/earnings'
import { db } from '@/lib/db'
import { DEFAULT_HOLDBACK_DAYS } from '@/lib/earnings'
import { balancesByAuthor, postPendingEarnings, refundPortions } from '@/lib/ledger'
import { parsePriceCents } from '@/lib/package-shape'

export const metadata: Metadata = { title: 'Earnings' }
export const dynamic = 'force-dynamic'

/**
 * What every contributor has earned, and what of it can be paid.
 *
 * **The sweep runs here, on load.** Earnings are posted from paid orders rather than from
 * the webhooks — see the note in lib/ledger.ts — and this is the page that cares, so it is
 * the sensible place to bring the ledger up to date. Doing a write during a render is only
 * safe because it is idempotent at the database: a unique index on (order, author, kind)
 * means a double render, a prefetch and a refresh all converge on one entry per sale.
 */
export default async function EarningsPage() {
  const posted = await postPendingEarnings()

  const [authors, balances, waiting] = await Promise.all([
    db.author.findMany({
      where: { archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        revenueSharePercent: true,
        ledger: {
          orderBy: { createdAt: 'desc' },
          take: 100,
          select: {
            id: true,
            kind: true,
            amountCents: true,
            currency: true,
            payableAt: true,
            sharePercent: true,
            basisCents: true,
            note: true,
            createdAt: true,
            orderId: true,
            order: {
              select: {
                amount: true,
                grossCents: true,
                paidAt: true,
                createdAt: true,
                refunds: { orderBy: { createdAt: 'asc' }, select: { amountCents: true, authorId: true } },
                lines: { select: { authorId: true, chargeCents: true } },
                ledger: { where: { kind: 'earning' }, select: { authorId: true, amountCents: true } },
              },
            },
          },
        },
      },
    }),
    balancesByAuthor(),
    db.payout.count({ where: { status: 'requested' } }),
  ])

  const rows = authors.map((author) => {
    const balance = balances[author.id] ?? { totalCents: 0, availableCents: 0, heldCents: 0 }
    return {
      id: author.id,
      name: author.name,
      slug: author.slug,
      revenueSharePercent: author.revenueSharePercent,
      ...balance,
      // One currency throughout for now; the column exists on every row so a second one
      // is a data change rather than a schema change.
      currency: author.ledger[0]?.currency ?? 'USD',
      entries: author.ledger.map((entry) => {
        /*
         * What is still refundable on the order behind this entry.
         *
         * Computed here rather than in the browser: the refunds already recorded against an
         * order are what decide it, and a form that offered more than was left would be
         * refused by the API after the operator had typed it.
         */
        const gross = entry.order
          ? (entry.order.grossCents ?? parsePriceCents(entry.order.amount))
          : null
        const refunded = entry.order?.refunds.reduce((sum, r) => sum + r.amountCents, 0) ?? 0
        return {
          id: entry.id,
          kind: entry.kind,
          amountCents: entry.amountCents,
          currency: entry.currency,
          payableAt: entry.payableAt?.toISOString() ?? null,
          sharePercent: entry.sharePercent,
          basisCents: entry.basisCents,
          note: entry.note,
          createdAt: entry.createdAt.toISOString(),
          /*
           * When the money moved, not when the row was written.
           *
           * The sweep posts old orders the first time it runs, so every entry's own
           * createdAt is the day somebody opened this page — a statement saying every sale
           * happened today, when they happened over months, is simply wrong.
           */
          occurredAt: (entry.order?.paidAt ?? entry.order?.createdAt ?? entry.createdAt).toISOString(),
          orderId: entry.orderId,
          /*
           * What is left to refund on this expert's part of the order. For an order of one
           * expert that is the order; for a cart it is their lines, less what has been
           * refunded against them, whole-order refunds counted by their share.
           */
          orderRefundableCents:
            gross === null || !entry.order
              ? null
              : (() => {
                  const portions = refundPortions(entry.order, gross)
                  const mine = portions.find((portion) => portion.authorId === author.id)
                  const orderLeft = Math.max(0, gross - refunded)
                  if (!mine) return 0
                  return Math.min(orderLeft, Math.max(0, mine.grossCents - refundedFromPortion(portions, author.id, entry.order.refunds)))
                })(),
          authorId: author.id,
        }
      }),
    }
  })

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <Eyebrow>Money out</Eyebrow>
      <h1 className="mt-4 font-display text-[32px] font-medium leading-[1.05] tracking-[-0.04em]">
        Earnings
      </h1>
      <p className="mt-3 max-w-2xl text-[18px] leading-relaxed text-ink-dim">
        A share of every sale, attributed to whoever sold it. Fees and tax come off before
        the split, and an earning is held {DEFAULT_HOLDBACK_DAYS} days after the payment
        clears so a refund lands on the ledger rather than on somebody you have already
        paid.
      </p>

      <div className="mt-6">
        <WithdrawalsLink waiting={waiting} />
      </div>

      {(posted.posted > 0 || posted.unreadable > 0) && (
        <p className="mt-6 rounded-lg border border-line bg-panel px-4 py-3 text-[15px] leading-relaxed text-ink-dim">
          {posted.posted > 0 && `Posted ${posted.posted} new earning${posted.posted === 1 ? '' : 's'}. `}
          {posted.house > 0 && `${posted.house} paid order${posted.house === 1 ? '' : 's'} belong to no contributor — house revenue. `}
          {posted.unreadable > 0 && (
            <span className="text-down">
              {posted.unreadable} order{posted.unreadable === 1 ? '' : 's'} had an amount that
              could not be read and were skipped.
            </span>
          )}
        </p>
      )}

      <div className="mt-8">
        <EarningsManager authors={rows} />
      </div>
    </div>
  )
}
