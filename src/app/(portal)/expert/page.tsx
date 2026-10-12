import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Download, FileDown } from 'lucide-react'

import { PayoutDetailsForm, WithdrawalForm } from '@/app/(portal)/affiliate/affiliate-forms'
import { ProfileForm } from '@/app/(portal)/expert/profile-form'
import { ChartFrame } from '@/components/charts/chart-parts'
import { DailyBars } from '@/components/charts/daily-bars'
import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { getCurrentMember } from '@/lib/auth'
import { authorWeek } from '@/lib/author-week'
import { DEFAULT_HOLDBACK_DAYS, DEFAULT_SHARE_PERCENT } from '@/lib/earnings'
import { authorForMember, expertStatement } from '@/lib/expert-account'
import { profileForExpert } from '@/lib/expert-profile'
import { expertSubscribers, type ExpertSubscriber } from '@/lib/expert-subscribers'
import { summariseByPeriod, totalsByProduct, type Period } from '@/lib/expert-statement'
import { balanceWithTotals, postPendingEarnings } from '@/lib/ledger'
import { formatPrice } from '@/lib/package-shape'
import { dailySeries, parsePeriod, periodLabel, weeklySeries, type Period as Range } from '@/lib/partner-report-shape'
import { payoutDetailsFor } from '@/lib/payout-details'
import { describePayoutDetails } from '@/lib/payout-details-shape'
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

/** Ranges for the earnings chart. No 7 days: in weekly bars that would be a single bar. */
const RANGES = [30, 90, 365] as const

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' })
const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/**
 * A subject matter expert's own page: their subscribers, their sales and their money.
 *
 * Subscribers are listed masked — "Sarah K.", "s•••@gmail.com" — with their section and
 * dates, the way an affiliate sees their clients. **Money stays in totals.** Sales are by
 * week, by month and by product; there is no list of payments and no amount per person,
 * because on a small section a dated amount beside a name is a buyer's bill.
 */
export default async function ExpertPage({ searchParams = {} }: { searchParams?: Record<string, string | string[] | undefined> }) {
  const member = await getCurrentMember()
  if (!member) redirect('/login?next=/expert')
  const author = await authorForMember(member.id)
  if (!author) notFound()

  // A sale paid since anyone last opened the earnings screen is posted now, so the figures
  // here are never a sweep behind. Idempotent; see postPendingEarnings.
  await postPendingEarnings({ limit: 200 })

  const asked = parsePeriod(searchParams.range, 90)
  const range: Range = (RANGES as readonly number[]).includes(asked) ? asked : 90
  const [weekly, statement, balance, payouts, shareSetting, subscribers, details, profile] = await Promise.all([
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
    expertSubscribers(author.id),
    payoutDetailsFor({ authorId: author.id }),
    profileForExpert(author.id),
  ])
  // A draft still waiting, or one sent back, is what they were last working on; otherwise
  // they start from what is live.
  const openDraft = profile.draft && profile.draft.status !== 'approved' ? profile.draft : null
  const profileStart = openDraft ?? profile.live
  const week = weekly?.week
  const months = summariseByPeriod(statement.entries, 'month', 12)
  const weeks = summariseByPeriod(statement.entries, 'week', 12)
  const products = totalsByProduct(statement.entries)
  // Your share per week, refunds taken off in the week they happened. Weekly, not daily:
  // beside the subscriber list's start dates, a day's figure could be one person's bill.
  const earningsByWeek = weeklySeries(
    dailySeries(statement.entries.map((entry) => ({ at: entry.at, value: entry.amountCents })), range),
  )
  const rangeTotal = earningsByWeek.reduce((sum, point) => sum + point.value, 0)

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

      {!details && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3">
          <p className="text-[15px] text-ink">Add your payout details so your withdrawals can be paid without retyping them.</p>
          <a href="#payout-details" className="text-[14px] text-accent-ink hover:underline">
            Add payout details →
          </a>
        </div>
      )}

      <details id="profile" className="panel mt-6 p-6" open={profile.draft?.status === 'rejected' || undefined}>
        <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3">
          <span className="eyebrow">Your public profile</span>
          <span className="text-[14px] text-ink-dim">
            {profile.draft?.status === 'pending'
              ? `Changes sent ${formatDate(profile.draft.submittedAt)} — waiting for approval`
              : profile.draft?.status === 'rejected'
                ? 'Changes not approved — see why below'
                : 'Edit your photo, headline, biography and links'}
          </span>
        </summary>
        <div className="mt-5">
          {profile.draft?.status === 'pending' && (
            <p className="mb-5 rounded-lg border border-line bg-panel-2 px-4 py-3 text-[14px] leading-relaxed text-ink-dim">
              The team is reviewing your changes. Your{' '}
              <Link href={`/experts/${author.slug}`} className="underline underline-offset-4 hover:text-ink">
                live profile
              </Link>{' '}
              stays as it is until they are approved. Sending again replaces what you sent.
            </p>
          )}
          {profile.draft?.status === 'rejected' && (
            <p className="mb-5 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-[14px] leading-relaxed text-ink">
              Not approved: {profile.draft.rejectReason}. Edit below and send again.
            </p>
          )}
          <ProfileForm
            name={author.name}
            initial={{
              headline: profileStart.headline,
              bio: profileStart.bio,
              photoUrl: profileStart.photoUrl,
              credentials: profileStart.credentials,
              websiteUrl: profileStart.websiteUrl,
              linkedinUrl: profileStart.linkedinUrl,
              xUrl: profileStart.xUrl,
            }}
          />
        </div>
      </details>

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

      <SubscriberList subscribers={subscribers} />

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
        <WithdrawalForm availableCents={free} endpoint="/api/expert/withdrawals" saved={details ? describePayoutDetails(details) : null} />
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="eyebrow">Your share, week by week</h2>
          <div role="group" aria-label="Range" className="inline-flex rounded-full border border-line p-1">
            {RANGES.map((option) => (
              <Link
                key={option}
                href={`/expert?range=${option}#earnings-chart`}
                scroll={false}
                aria-current={option === range ? 'true' : undefined}
                className={`rounded-full px-3 py-1.5 font-mono text-[13px] ${
                  option === range ? 'bg-accent text-on-accent' : 'text-ink-dim hover:text-ink'
                }`}
              >
                {option === 365 ? '1y' : `${option}d`}
              </Link>
            ))}
          </div>
        </div>
        <div id="earnings-chart">
          <ChartFrame title={`${formatPrice(Math.max(0, rangeTotal))} in the last ${periodLabel(range)}`}>
            <DailyBars points={earningsByWeek} format={(cents) => (cents < 0 ? `−${formatPrice(-cents)}` : formatPrice(cents))} label="Your share per week" />
          </ChartFrame>
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
          Each bar is a week, labelled with its first day; refunds come off in the week they were made. Shown by week rather
          than by day so no single subscriber's payment can be picked out.
        </p>
      </section>

      <section id="payout-details" className="panel mt-8 p-6">
        <h2 className="eyebrow mb-5">Payout details</h2>
        <PayoutDetailsForm
          endpoint="/api/expert/payout-details"
          current={
            details
              ? { summary: describePayoutDetails(details), holderName: details.holderName, method: details.method, updatedAt: formatDate(details.updatedAt) }
              : null
          }
        />
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="eyebrow">Sales by month</h2>
          <a
            href="/api/expert/statement"
            className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[14px] text-ink hover:border-accent/50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Download CSV
          </a>
        </div>
        <PeriodTable periods={months} label={(period) => MONTH.format(period.start)} />
        <details className="mt-4">
          <summary className="cursor-pointer text-[15px] text-ink-dim hover:text-ink">Week by week</summary>
          <div className="mt-3">
            <PeriodTable periods={weeks} label={(period) => `w/c ${DAY.format(period.start)}`} />
          </div>
        </details>
        <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
          Totals only. Deductions are payment fees, tax and affiliate commission, taken before your share. Individual
          payments are not listed, so no subscriber's bill can be read from them. The CSV holds the same totals.
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
      <div className={`mt-1 font-mono text-xl ${accent ? 'text-accent-ink' : 'text-ink'}`}>{value}</div>
    </div>
  )
}

const SUBSCRIBER_STATUS: Record<string, { label: string; tone: 'accent' | 'muted' }> = {
  active: { label: 'Subscribed', tone: 'accent' },
  trialing: { label: 'Trial', tone: 'accent' },
  cancelled: { label: 'Cancelled', tone: 'muted' },
  expired: { label: 'Lapsed', tone: 'muted' },
}

function SubscriberList({ subscribers }: { subscribers: ExpertSubscriber[] }) {
  const live = subscribers.filter((row) => row.status === 'active' || row.status === 'trialing').length
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="eyebrow">Your subscribers</h2>
        <span className="text-[14px] text-ink-dim">
          {live} live · {subscribers.length - live} lapsed
        </span>
      </div>
      <div className="panel relative max-h-[32rem] overflow-auto">
        {subscribers.length === 0 ? (
          <p className="px-5 py-8 text-center text-[15px] text-ink-dim">Nobody has subscribed to your sections yet.</p>
        ) : (
          <table className="w-full min-w-[44rem] text-left">
            <thead className="sticky top-0 bg-panel">
              <tr className="border-b border-line">
                <th className="eyebrow px-4 py-3">Subscriber</th>
                <th className="eyebrow px-4 py-3">Section</th>
                <th className="eyebrow px-4 py-3">Country</th>
                <th className="eyebrow px-4 py-3">Since</th>
                <th className="eyebrow px-4 py-3">Renews</th>
                <th className="eyebrow px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {subscribers.map((row) => {
                const live = row.status === 'active' || row.status === 'trialing'
                return (
                  <tr key={row.id} className="border-b border-line/60 align-top last:border-0">
                    <td className="px-4 py-3">
                      <div className="text-[15px] text-ink">{row.name}</div>
                      <div className="font-mono text-[13px] text-ink-dim">{row.email}</div>
                    </td>
                    <td className="px-4 py-3 text-[14px] text-ink-dim">{row.section}</td>
                    <td className="px-4 py-3 font-mono text-[14px] text-ink-dim">{row.country ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[14px] text-ink-dim">{formatDate(row.since)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[14px] text-ink-dim">
                      {live && row.renewsAt ? `${row.ending ? 'Ends' : 'Renews'} ${formatDate(row.renewsAt)}` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={SUBSCRIBER_STATUS[row.status]?.tone ?? 'muted'}>{SUBSCRIBER_STATUS[row.status]?.label ?? row.status}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
        For their privacy, subscribers are shown by first name and last initial with a masked email. All-access members
        who can also read you are counted above, not listed.
      </p>
    </section>
  )
}
