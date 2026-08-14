import Link from 'next/link'
import type { Metadata } from 'next'
import { ArrowUpRight } from 'lucide-react'

import { AffiliateCreator } from '@/app/admin/affiliates/affiliate-creator'
import { Badge } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth'
import { ATTRIBUTION_DAYS, describeReward, formatAward, referralLink } from '@/lib/affiliates'
import { db } from '@/lib/db'
import { appBaseUrl } from '@/lib/env'

export const metadata: Metadata = {
  title: 'Affiliates',
  robots: { index: false, follow: false },
}
export const dynamic = 'force-dynamic'

/**
 * The affiliate programme.
 *
 * The numbers that matter to an operator, in the order they matter: who is sending
 * traffic, how much of it converts, and what is owed. Clicks are shown alongside
 * conversions on purpose — a partner sending a thousand people who never buy looks
 * identical to one sending nobody if you only count sales.
 */
export default async function AdminAffiliatesPage() {
  await requireAdmin()

  const affiliates = await db.affiliate.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      referrals: { select: { status: true } },
      awards: { select: { amount: true, kind: true, settledAt: true } },
    },
  })

  const base = safeBaseUrl()

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-5 sm:py-12">
      <div className="mb-8">
        <span className="eyebrow">Referrals &amp; rewards</span>
        <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Affiliates</h1>
        <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ink-dim">
          Each affiliate gets a link. A click is attributed for {ATTRIBUTION_DAYS} days, and an
          award is earned when the person <span className="text-ink">pays</span> — never when they
          sign up. Awards are a record of what is owed; paying them happens outside this system.
        </p>
      </div>

      <AffiliateCreator />

      <div className="mt-8 space-y-3">
        {affiliates.length === 0 ? (
          <div className="panel px-5 py-12 text-center text-[15px] text-ink-dim">
            No affiliates yet. Create one above and share the link it gives you.
          </div>
        ) : (
          affiliates.map((affiliate) => {
            const clicks = affiliate.referrals.length
            const signups = affiliate.referrals.filter((r) => r.status !== 'visited').length
            const conversions = affiliate.referrals.filter((r) => r.status === 'converted').length
            const owed = affiliate.awards
              .filter((award) => !award.settledAt)
              .reduce((total, award) => total + award.amount, 0)

            return (
              <Link
                key={affiliate.id}
                href={`/admin/affiliates/${affiliate.id}`}
                className="panel block px-5 py-5 transition-colors hover:border-accent/40"
              >
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h2 className="text-[17px] text-ink">{affiliate.name}</h2>
                      <Badge tone={statusTone(affiliate.status)}>{affiliate.status}</Badge>
                    </div>
                    <p className="mt-1 break-all font-mono text-[12px] text-ink-dim">
                      {referralLink(base, affiliate.slug)}
                    </p>
                    <p className="mt-1.5 text-[13px] text-ink-dim">
                      {describeReward(affiliate.rewardKind, affiliate.rewardAmount)}
                      {affiliate.visitorDiscountPercent
                        ? ` · visitor gets ${affiliate.visitorDiscountPercent}% off`
                        : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-5 sm:gap-7">
                    <Metric label="Clicks" value={clicks} />
                    <Metric label="Signups" value={signups} />
                    <Metric label="Paid" value={conversions} />
                    <Metric
                      label="Owed"
                      value={formatAward(affiliate.rewardKind, owed)}
                      accent={owed > 0}
                    />
                    <ArrowUpRight className="hidden h-4 w-4 text-ink-dim sm:block" aria-hidden />
                  </div>
                </div>
              </Link>
            )
          })
        )}
      </div>
    </div>
  )
}

function Metric({
  label,
  value,
  accent,
}: {
  label: string
  value: string | number
  accent?: boolean
}) {
  return (
    <div className="text-right">
      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">{label}</div>
      <div className={`mt-0.5 font-mono text-[17px] ${accent ? 'text-accent' : 'text-ink'}`}>
        {value}
      </div>
    </div>
  )
}

function statusTone(status: string) {
  if (status === 'active') return 'up' as const
  if (status === 'paused') return 'accent' as const
  return 'muted' as const
}

/**
 * The base URL for the links shown here.
 *
 * Falls back to a placeholder rather than throwing: an operator opening this page before
 * APP_BASE_URL is set should see the programme and an obviously-wrong host, not a crash.
 */
function safeBaseUrl(): string {
  try {
    return appBaseUrl()
  } catch {
    return 'https://APP_BASE_URL-not-set'
  }
}
