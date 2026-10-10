import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { FileDown } from 'lucide-react'

import { WithdrawalForm } from '@/app/(portal)/affiliate/affiliate-forms'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { getCurrentMember } from '@/lib/auth'
import { authorWeek } from '@/lib/author-week'
import { DEFAULT_HOLDBACK_DAYS, DEFAULT_SHARE_PERCENT } from '@/lib/earnings'
import { authorForMember, expertStatement } from '@/lib/expert-account'
import { summariseByPeriod, totalsByProduct, type Period } from '@/lib/expert-statement'
import { balanceWithTotals, postPendingEarnings } from '@/lib/ledger'
import { formatPrice } from '@/lib/package-shape'
import { db } from '@/lib/db'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Expert', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const STATUS_LABEL: Record<string, string> = {
  requested: 'Awaiting approval',
  approved: 'Approved',
  sent: 'Sent',
  settled: 'Paid',
  rejected: 'Declined',
  failed: 'Failed',
}

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * A subject matter expert's own page: their subscribers, their sales and their money.
 *
 * **They never see who their subscribers are.** Subscriber figures are the weekly report's
 * counts and trend; sales are totals by week and by month. There is no list of payments,
 * no member, no email, and no route that returns one — on a small section a dated amount
 * is enough to recognise a buyer, so even anonymous per-payment rows are left out.
 */
export default async function ExpertPage() {
  const member = await getCurrentMember()
  if (!member) redirect('/login?next=/expert')
  const author = await authorForMember(member.id)
  if (!author) notFound()

  // A sale paid since anyone last opened the earnings screen is posted now, so the figures
  // here are never a sweep behind. Idempotent; see postPendingEarnings.
  await postPendingEarnings({ limit: 200 })

  const [weekly, statement, balance, payouts, shareSetting] = await Promise.all([
    authorWeek(author.id),
    expertStatement(author.id),
    balanceWithTotals({ authorId: author.id }),
    db.payout.findMany({
      where: { authorId: author.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, amountCents: true, status: true, createdAt: true, rejectedReason: true },
    }),
    author.revenueSharePercent ?? DEFAULT_SHARE_PERCENT,
  ])
  const week = weekly?.week
  const months = summariseByPeriod(statement.entries, 'month', 12)
  const weeks = summariseByPeriod(statement.entries, 'week', 12)
  const products = totalsByProduct(statement.entries)

  const pendingCents = payouts
    .filter((payout) => payout.status === 'requested' || payout.status === 'approved')
    .reduce((sum, payout) => sum + payout.amountCents, 0)
  const free = Math.max(0, balance.availableCents - pendingCents)

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <span className="eyebrow">Subject matter expert</span>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl text-ink sm:text-4xl">{author.name}</h1>
        {author.archivedAt && <Badge tone="muted">retired</Badge>}
      </div>
      <p className="mt-2 text-[15px] text-ink-dim">
        <Link href={`/experts/${author.slug}`} className="underline underline-offset-4 hover:text-ink">
          Your public profile
        </Link>{' '}
        · your share is {shareSetting}% of each sale after fees, tax and any affiliate commission.
      </p>

      {/* Subscribers ------------------------------------------------------------------ */}
      <section className="panel mt-8 p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="eyebrow">Subscribers</h2>
          <ButtonLink size="sm" variant="secondary" href="/api/expert/weekly-report">
            <FileDown className="h-3.5 w-3.5" aria-hidden />
            Weekly report (PDF)
          </ButtonLink>
        </div>
        {week ? (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Subscribed now" value={String(week.totals.live)} />
              <Stat label="New this week" value={String(week.totals.started)} />
              <Stat label="Lapsed this week" value={String(week.totals.lapsed)} />
              <Stat label="Renewals due (30 days)" value={String(week.renewalsDue)} />
            </div>
            <p className="mt-4 text-[14px] leading-relaxed text-ink-dim">
              Week to {formatDate(new Date(week.to.getTime() - 1))}.
              {week.weekOnWeek !== null
                ? ` ${week.weekOnWeek >= 0 ? '+' : ''}${week.weekOnWeek} on the week before.`
                : ''}{' '}
              {week.allAccessReaders > 0
                ? `${week.allAccessReaders} all-access member${week.allAccessReaders === 1 ? '' : 's'} can also read you.`
                : ''}{' '}
              {week.reads > 0 ? `${week.reads} report opens this week.` : ''}
            </p>

            {week.sections.length > 0 && (
              <div className="mt-5 overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="eyebrow py-2 pr-4">Section</th>
                      <Th>Now</Th>
                      <Th>New</Th>
                      <Th>Lapsed</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {week.sections.map((section) => (
                      <tr key={section.name} className="border-b border-line/60 last:border-0">
                        <td className="py-2 pr-4 text-[15px] text-ink">{section.name}</td>
                        <Td>{section.live}</Td>
                        <Td>{section.started}</Td>
                        <Td>{section.lapsed}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <h3 className="mt-6 text-[15px] text-ink">Subscribed, week by week</h3>
            <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-8">
              {week.history.map((point) => (
                <div key={point.to.toISOString()} className="rounded-md border border-line px-2 py-2 text-center">
                  <div className="font-mono text-[11px] text-ink-dim">{DAY.format(new Date(point.to.getTime() - 1))}</div>
                  <div className="font-mono text-[17px] text-ink">{point.live}</div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-ink-dim">
              How they pay: {week.composition.card} card · {week.composition.crypto} crypto · {week.composition.code} code ·{' '}
              {week.composition.comp} complimentary.
            </p>
          </>
        ) : (
          <p className="text-[15px] text-ink-dim">No subscriber figures yet.</p>
        )}
      </section>

      {/* Money --------------------------------------------------------------------- */}
      <section className="panel mt-8 p-6">
        <h2 className="eyebrow mb-5">Earnings</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Earned" value={formatPrice(balance.earnedCents)} />
          <Stat label={`Held (${DEFAULT_HOLDBACK_DAYS} days)`} value={formatPrice(balance.heldCents)} />
          <Stat label="Available" value={formatPrice(free)} accent={free > 0} />
          <Stat label="Paid out" value={formatPrice(balance.paidCents)} />
        </div>
        <p className="mt-4 text-[14px] leading-relaxed text-ink-dim">
          Each sale is held for {DEFAULT_HOLDBACK_DAYS} days after the payment clears, in case it is refunded. A refund
          takes its share back.
          {pendingCents > 0 ? ` ${formatPrice(pendingCents)} is on a withdrawal already in progress.` : ''}
          {/* A refund comes off at once while the sale it refunds may still be held, so the
              held figure can exceed what is earned. Said, so the two do not look wrong. */}
          {balance.heldCents > balance.earnedCents
            ? ` Refunds have already taken back ${formatPrice(balance.heldCents - Math.max(0, balance.earnedCents))} from sales still being held; that comes off what they release.`
            : ''}
        </p>
        <WithdrawalForm availableCents={free} endpoint="/api/expert/withdrawals" />
      </section>

      <section className="mt-8">
        <h2 className="eyebrow mb-3">Sales by month</h2>
        <PeriodTable periods={months} label={(period) => MONTH.format(period.start)} />
        <details className="mt-4">
          <summary className="cursor-pointer text-[15px] text-ink-dim hover:text-ink">Week by week</summary>
          <div className="mt-3">
            <PeriodTable periods={weeks} label={(period) => `w/c ${DAY.format(period.start)}`} />
          </div>
        </details>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
          Totals only. Deductions are payment fees, tax and affiliate commission, taken before your share. Individual
          payments are not listed, so no subscriber can be picked out from them.
        </p>
      </section>

      {products.length > 0 && (
        <section className="mt-8">
          <h2 className="eyebrow mb-3">By product, all time</h2>
          <div className="panel overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className="eyebrow px-4 py-3">Product</th>
                  <Th>Payments</Th>
                  <Th>Your share</Th>
                  <Th>Taken back</Th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={product.key} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3 text-[15px] text-ink">{statement.names.get(product.key) ?? 'Retired product'}</td>
                    <Td>{product.payments}</Td>
                    <Td>{formatPrice(product.shareCents)}</Td>
                    <Td>{product.takenBackCents ? formatPrice(product.takenBackCents) : '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

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

function PeriodTable({ periods, label }: { periods: Period[]; label: (period: Period) => string }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[640px] text-left">
        <thead>
          <tr className="border-b border-line">
            <th className="eyebrow px-4 py-3">Period</th>
            <Th>Payments</Th>
            <Th>Gross</Th>
            <Th>Deductions</Th>
            <Th>Net</Th>
            <Th>Your share</Th>
            <Th>Taken back</Th>
          </tr>
        </thead>
        <tbody>
          {periods.map((period) => {
            const empty = period.payments === 0 && period.takenBackCents === 0
            return (
              <tr key={period.key} className={`border-b border-line/60 last:border-0 ${empty ? 'text-ink-dim/60' : ''}`}>
                <td className="whitespace-nowrap px-4 py-2.5 text-[15px] text-ink">{label(period)}</td>
                <Td>{period.payments || '—'}</Td>
                <Td>{empty ? '—' : formatPrice(period.grossCents)}</Td>
                <Td>{empty ? '—' : formatPrice(period.deductionsCents)}</Td>
                <Td>{empty ? '—' : formatPrice(period.netCents)}</Td>
                <Td strong>{empty ? '—' : formatPrice(period.shareCents)}</Td>
                <Td>{period.takenBackCents ? formatPrice(period.takenBackCents) : '—'}</Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="eyebrow px-4 py-3 text-right">{children}</th>
}

function Td({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <td className={`whitespace-nowrap px-4 py-2.5 text-right font-mono text-[15px] ${strong ? 'text-ink' : 'text-ink-dim'}`}>
      {children}
    </td>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">{label}</div>
      <div className={`mt-1 font-mono text-xl ${accent ? 'text-accent' : 'text-ink'}`}>{value}</div>
    </div>
  )
}
