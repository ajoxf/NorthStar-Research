import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { WithdrawalPlanner } from '@/app/(portal)/tools/withdrawal-planner/planner'
import { getCurrentMember, hasActiveSubscription } from '@/lib/auth'

export const metadata: Metadata = { title: 'Systematic withdrawal planner' }
export const dynamic = 'force-dynamic'

export default async function WithdrawalPlannerPage() {
  const member = await getCurrentMember()
  if (!member) redirect('/login?next=/tools/withdrawal-planner')
  // Tools are part of what the membership buys, so they sit behind the same gate as
  // the research itself.
  if (!hasActiveSubscription(member)) redirect('/dashboard')

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <Link
        href="/tools"
        className="mb-8 inline-flex items-center gap-1.5 text-[14px] text-ink-dim transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        All tools
      </Link>

      <div className="mb-9 max-w-2xl">
        <span className="eyebrow">Analysis</span>
        <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Systematic withdrawal planner</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-ink-dim">
          Model how long a portfolio sustains a given level of withdrawals, with the spending
          indexed to inflation and the ending balance shown in today&apos;s money as well as
          nominal terms.
        </p>
      </div>

      <WithdrawalPlanner />

      {/* Stated plainly rather than buried: a flat return assumption is the single
          biggest limitation of a deterministic decumulation model. */}
      <section className="panel mt-6 p-6">
        <h2 className="eyebrow mb-4">How to read this</h2>
        <ul className="space-y-3 text-[15px] leading-relaxed text-ink-dim">
          <li>
            <strong className="font-medium text-ink">Returns are assumed, not simulated.</strong>{' '}
            Every year earns the same rate here. Real markets do not work that way, and in
            decumulation the <em>order</em> of returns matters enormously — a poor first few years
            does far more damage than the same years later on. This model cannot show that risk.
          </li>
          <li>
            <strong className="font-medium text-ink">Taxes and fees are excluded.</strong> Your
            actual withdrawals need to cover both, so treat the figures as gross.
          </li>
          <li>
            <strong className="font-medium text-ink">Withdrawals come out first.</strong> Money is
            taken at the start of each year, before growth — the conservative convention.
          </li>
          <li>
            <strong className="font-medium text-ink">
              This is an illustration, not financial advice.
            </strong>{' '}
            It is a planning aid for your own analysis. Speak to a licensed adviser before acting
            on it.
          </li>
        </ul>
      </section>
    </div>
  )
}
