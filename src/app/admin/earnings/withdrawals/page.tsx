import type { Metadata } from 'next'
import Link from 'next/link'

import { WithdrawalQueue } from '@/app/admin/earnings/withdrawals/withdrawal-queue'
import { Eyebrow } from '@/components/band'
import { db } from '@/lib/db'
import { selfApproved, type PayoutStatusValue } from '@/lib/payout-flow'

export const metadata: Metadata = { title: 'Withdrawals' }
export const dynamic = 'force-dynamic'

/**
 * Every withdrawal, and the one approval each needs.
 *
 * Its own page rather than a panel on the earnings screen, because it is a different job:
 * asking for money and agreeing to it are meant to be two acts, and ideally by two people.
 * Keeping them on separate screens is the smallest version of that separation.
 */
export default async function WithdrawalsPage() {
  const payouts = await db.payout.findMany({
    orderBy: [{ requestedAt: 'desc' }],
    take: 200,
    select: {
      id: true,
      amountCents: true,
      currency: true,
      status: true,
      destination: true,
      note: true,
      rejectedReason: true,
      externalReference: true,
      requestedAt: true,
      approvedAt: true,
      sentAt: true,
      requestedByMemberId: true,
      approvedByMemberId: true,
      author: { select: { name: true } },
      requestedBy: { select: { email: true } },
      approvedBy: { select: { email: true } },
    },
  })

  const rows = payouts.map((payout) => ({
    id: payout.id,
    authorName: payout.author.name,
    amountCents: payout.amountCents,
    currency: payout.currency,
    status: payout.status as PayoutStatusValue,
    destination: payout.destination,
    note: payout.note,
    rejectedReason: payout.rejectedReason,
    externalReference: payout.externalReference,
    requestedByEmail: payout.requestedBy?.email ?? null,
    approvedByEmail: payout.approvedBy?.email ?? null,
    requestedAt: payout.requestedAt.toISOString(),
    approvedAt: payout.approvedAt?.toISOString() ?? null,
    sentAt: payout.sentAt?.toISOString() ?? null,
    selfApproved: selfApproved(payout),
  }))

  const waiting = rows.filter((row) => row.status === 'requested').length

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <Link
        href="/admin/earnings"
        className="font-mono text-[12px] text-ink-dim hover:text-ink"
      >
        ← Earnings
      </Link>
      <Eyebrow className="mt-6">Money out</Eyebrow>
      <h1 className="mt-4 font-display text-[32px] font-medium leading-[1.05] tracking-[-0.04em]">
        Withdrawals
      </h1>
      <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-dim">
        Every withdrawal is approved before it can be marked sent — a request on its own
        moves nothing. Marking one sent records that the money has left and takes it off
        the contributor&rsquo;s balance; it does not perform the transfer, which is still
        done by hand through the gateway.
      </p>
      {waiting > 0 && (
        <p className="mt-4 rounded-lg border border-accent/35 bg-accent/10 px-4 py-3 text-[14px] text-ink">
          {waiting} withdrawal{waiting === 1 ? '' : 's'} waiting for approval.
        </p>
      )}

      <div className="mt-8">
        <WithdrawalQueue payouts={rows} />
      </div>
    </div>
  )
}
