import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { AffiliateLink, WithdrawalForm } from '@/app/(portal)/affiliate/affiliate-forms'
import { Badge } from '@/components/ui/badge'
import { affiliateForMember } from '@/lib/affiliate-account'
import { describeReward, referralLink } from '@/lib/affiliates'
import { getCurrentMember } from '@/lib/auth'
import { db } from '@/lib/db'
import { DEFAULT_HOLDBACK_DAYS } from '@/lib/earnings'
import { appBaseUrl } from '@/lib/env'
import { balanceForAffiliate } from '@/lib/ledger'
import { formatPrice } from '@/lib/package-shape'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Affiliate', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  requested: 'Awaiting approval',
  approved: 'Approved',
  sent: 'Sent',
  settled: 'Paid',
  rejected: 'Declined',
  failed: 'Failed',
}

/**
 * An affiliate's own page: their link, what it has brought in, and their money.
 *
 * Counts only. The people who came through the link are customers of the site, not of the
 * affiliate, and nothing here names them — no emails, no names, no per-buyer amounts.
 */
export default async function AffiliatePage() {
  const member = await getCurrentMember()
  if (!member) redirect('/login?next=/affiliate')
  const affiliate = await affiliateForMember(member.id)
  if (!affiliate) notFound()

  const [clicks, signups, conversions, balance, payouts] = await Promise.all([
    db.referral.count({ where: { affiliateId: affiliate.id } }),
    db.referral.count({ where: { affiliateId: affiliate.id, status: { in: ['signed_up', 'converted'] } } }),
    db.referral.count({ where: { affiliateId: affiliate.id, status: 'converted' } }),
    balanceForAffiliate(affiliate.id),
    db.payout.findMany({
      where: { affiliateId: affiliate.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, amountCents: true, status: true, createdAt: true, rejectedReason: true },
    }),
  ])
  const pendingCents = payouts
    .filter((payout) => payout.status === 'requested' || payout.status === 'approved')
    .reduce((sum, payout) => sum + payout.amountCents, 0)
  const free = Math.max(0, balance.availableCents - pendingCents)

  return (
    <div className="mx-auto max-w-4xl px-5 py-12">
      <span className="eyebrow">Affiliate</span>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl text-ink sm:text-4xl">{affiliate.name}</h1>
        {affiliate.status !== 'active' && (
          <Badge tone={affiliate.status === 'paused' ? 'accent' : 'muted'}>{affiliate.status}</Badge>
        )}
      </div>
      {affiliate.status !== 'active' && (
        <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
          Your link is not earning new commission at the moment. What you have already earned is
          still yours to withdraw.
        </p>
      )}

      <section className="panel mt-8 p-6">
        <h2 className="eyebrow mb-4">Your link</h2>
        <AffiliateLink link={referralLink(safeBase(), affiliate.slug)} />
        <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
          People who buy within 30 days of following your link earn you{' '}
          {describeReward(affiliate.rewardKind, affiliate.rewardAmount, affiliate.commissionOn)}.
          {affiliate.visitorDiscountPercent
            ? ` They get ${affiliate.visitorDiscountPercent}% off their first payment.`
            : ''}
        </p>
      </section>

      <div className="mt-8 grid grid-cols-3 gap-3">
        <Stat label="Clicks" value={String(clicks)} />
        <Stat label="Signed up" value={String(signups)} />
        <Stat label="Paid" value={String(conversions)} />
      </div>

      <section className="panel mt-8 p-6">
        <h2 className="eyebrow mb-5">Earnings</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Earned" value={formatPrice(balance.earnedCents)} />
          <Stat label={`Held (${DEFAULT_HOLDBACK_DAYS} days)`} value={formatPrice(balance.heldCents)} />
          <Stat label="Available" value={formatPrice(free)} accent={free > 0} />
          <Stat label="Paid out" value={formatPrice(balance.paidCents)} />
        </div>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-dim">
          Commission is held for {DEFAULT_HOLDBACK_DAYS} days after each payment, in case it is refunded.
          A refunded payment takes its commission back.
          {pendingCents > 0 ? ` ${formatPrice(pendingCents)} is on a withdrawal already in progress.` : ''}
        </p>

        <WithdrawalForm availableCents={free} />
      </section>

      <section className="mt-8">
        <h2 className="eyebrow mb-3">Withdrawals</h2>
        <div className="panel overflow-x-auto">
          {payouts.length === 0 ? (
            <p className="px-5 py-8 text-center text-[15px] text-ink-dim">No withdrawals yet.</p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className="eyebrow px-4 py-3">Asked</th>
                  <th className="eyebrow px-4 py-3">Amount</th>
                  <th className="eyebrow px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout.id} className="border-b border-line/60 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-[15px] text-ink-dim">{formatDate(payout.createdAt)}</td>
                    <td className="px-4 py-3 font-mono text-[15px] text-ink">{formatPrice(payout.amountCents)}</td>
                    <td className="px-4 py-3 text-[15px] text-ink-dim">
                      {STATUS_LABEL[payout.status] ?? payout.status}
                      {payout.status === 'rejected' && payout.rejectedReason ? ` — ${payout.rejectedReason}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}

function safeBase(): string {
  try {
    return appBaseUrl()
  } catch {
    return ''
  }
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">{label}</div>
      <div className={`mt-1 font-mono text-xl ${accent ? 'text-accent' : 'text-ink'}`}>{value}</div>
    </div>
  )
}
