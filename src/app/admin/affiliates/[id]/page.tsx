import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { AffiliatePanel } from '@/app/admin/affiliates/[id]/affiliate-panel'
import { Badge } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth'
import { describeReward, formatAward, referralLink } from '@/lib/affiliates'
import { db } from '@/lib/db'
import { appBaseUrl } from '@/lib/env'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Affiliate', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function AdminAffiliatePage({ params }: { params: { id: string } }) {
  await requireAdmin()

  const affiliate = await db.affiliate.findUnique({
    where: { id: params.id },
    include: {
      referrals: { orderBy: { visitedAt: 'desc' }, take: 100 },
      awards: { orderBy: { createdAt: 'desc' }, take: 100, include: { referral: true } },
    },
  })
  if (!affiliate) notFound()

  const conversions = affiliate.referrals.filter((r) => r.status === 'converted')
  const owed = affiliate.awards
    .filter((award) => !award.settledAt)
    .reduce((total, award) => total + award.amount, 0)
  const settled = affiliate.awards
    .filter((award) => award.settledAt)
    .reduce((total, award) => total + award.amount, 0)

  let base = 'https://APP_BASE_URL-not-set'
  try {
    base = appBaseUrl()
  } catch {
    // Shown as-is; an operator seeing an obviously-wrong host is better than a crash.
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-5 sm:py-12">
      <Link
        href="/admin/affiliates"
        className="mb-6 inline-flex items-center gap-1.5 font-mono text-[12px] text-ink-dim hover:text-ink"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden />
        All affiliates
      </Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl text-ink sm:text-3xl">{affiliate.name}</h1>
        <Badge tone={affiliate.status === 'active' ? 'up' : affiliate.status === 'paused' ? 'accent' : 'muted'}>
          {affiliate.status}
        </Badge>
      </div>
      <p className="mt-1.5 break-all font-mono text-[12px] text-ink-dim">{affiliate.email}</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Clicks" value={affiliate.referrals.length} />
        <Stat label="Paid conversions" value={conversions.length} />
        <Stat label="Owed" value={formatAward(affiliate.rewardKind, owed)} accent={owed > 0} />
        <Stat label="Settled" value={formatAward(affiliate.rewardKind, settled)} />
      </div>

      <AffiliatePanel
        affiliate={{
          id: affiliate.id,
          name: affiliate.name,
          email: affiliate.email,
          status: affiliate.status,
          rewardKind: affiliate.rewardKind,
          rewardAmount: affiliate.rewardAmount,
          visitorDiscountPercent: affiliate.visitorDiscountPercent,
          notes: affiliate.notes,
          link: referralLink(base, affiliate.slug),
          rewardDescription: describeReward(affiliate.rewardKind, affiliate.rewardAmount),
        }}
        awards={affiliate.awards.map((award) => ({
          id: award.id,
          amount: formatAward(award.kind, award.amount),
          reason: award.reason ?? 'Conversion',
          createdAt: formatDate(award.createdAt),
          settled: Boolean(award.settledAt),
        }))}
      />

      <section className="mt-10">
        <h2 className="eyebrow mb-3">Referrals</h2>
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="border-b border-line">
                <th className="eyebrow px-4 py-3">Status</th>
                <th className="eyebrow px-4 py-3">Email</th>
                <th className="eyebrow px-4 py-3">Paid</th>
                <th className="eyebrow px-4 py-3">First seen</th>
              </tr>
            </thead>
            <tbody>
              {affiliate.referrals.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[15px] text-ink-dim">
                    No clicks on this link yet.
                  </td>
                </tr>
              ) : (
                affiliate.referrals.map((referral) => (
                  <tr key={referral.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3">
                      <Badge tone={referral.status === 'converted' ? 'up' : 'muted'}>
                        {referral.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    {/* Anonymous until they sign up — a click is a tally, not a tracker. */}
                    <td className="break-all px-4 py-3 text-[14px] text-ink-dim">
                      {referral.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 font-mono text-[14px] text-ink-dim">
                      {referral.amountUsd ? `$${referral.amountUsd}` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[14px] text-ink-dim">
                      {formatDate(referral.visitedAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: boolean
}) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">{label}</div>
      <div className={`mt-1 font-mono text-xl ${accent ? 'text-accent' : 'text-ink'}`}>{value}</div>
    </div>
  )
}
