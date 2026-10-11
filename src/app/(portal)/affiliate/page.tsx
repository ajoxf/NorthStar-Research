import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Download } from 'lucide-react'

import { AffiliateLink, LinkBuilder, WithdrawalForm } from '@/app/(portal)/affiliate/affiliate-forms'
import { ChartFrame } from '@/components/charts/chart-parts'
import { DailyBars } from '@/components/charts/daily-bars'
import { Badge } from '@/components/ui/badge'
import { affiliateForMember } from '@/lib/affiliate-account'
import {
  affiliateCampaigns,
  affiliateClients,
  affiliateOverview,
  affiliateStatement,
  affiliateSubs,
  type StatementRow,
} from '@/lib/affiliate-report'
import { describeReward, referralLink } from '@/lib/affiliates'
import { getCurrentMember } from '@/lib/auth'
import { db } from '@/lib/db'
import { DEFAULT_HOLDBACK_DAYS } from '@/lib/earnings'
import { appBaseUrl } from '@/lib/env'
import { balanceForAffiliate } from '@/lib/ledger'
import { formatPrice } from '@/lib/package-shape'
import { PERIODS, type Period, parsePeriod, percentOf, periodLabel } from '@/lib/partner-report-shape'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Affiliate', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const PAYOUT_LABEL: Record<string, string> = {
  requested: 'Awaiting approval',
  approved: 'Approved',
  sent: 'Sent',
  settled: 'Paid',
  rejected: 'Declined',
  failed: 'Failed',
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'clients', label: 'Clients' },
  { id: 'statement', label: 'Statement' },
  { id: 'links', label: 'Links & campaigns' },
  { id: 'subs', label: 'Sub-affiliates' },
  { id: 'withdrawals', label: 'Withdrawals' },
] as const
type Tab = (typeof TABS)[number]['id']

/**
 * An affiliate's own page: their link, who it brought in, and their money.
 *
 * The people who came through the link are shown masked — "Sarah K.", "s•••@gmail.com" —
 * with only what they bought through this affiliate. Enough to recognise a client they
 * introduced; not enough to take the site's customer list elsewhere.
 */
export default async function AffiliatePage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const member = await getCurrentMember()
  if (!member) redirect('/login?next=/affiliate')
  const affiliate = await affiliateForMember(member.id)
  if (!affiliate) notFound()

  const tabParam = String(searchParams.tab ?? 'overview')
  const tab: Tab = TABS.some((entry) => entry.id === tabParam) ? (tabParam as Tab) : 'overview'
  const days = parsePeriod(searchParams.days, tab === 'statement' ? 90 : 30)
  // The tab shows for a master partner only: anyone else has nothing in it.
  const isMaster = (await db.affiliate.count({ where: { parentAffiliateId: affiliate.id } })) > 0
  const tabs = TABS.filter((entry) => entry.id !== 'subs' || isMaster)

  return (
    <div className="mx-auto max-w-5xl px-5 py-12">
      <span className="eyebrow">Affiliate</span>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl text-ink sm:text-4xl">{affiliate.name}</h1>
        <code className="rounded-full border border-line px-3 py-1 font-mono text-[13px] text-ink-dim">{affiliate.slug}</code>
        {affiliate.status !== 'active' && (
          <Badge tone={affiliate.status === 'paused' ? 'accent' : 'muted'}>{affiliate.status}</Badge>
        )}
      </div>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
        {describeReward(affiliate.rewardKind, affiliate.rewardAmount, affiliate.commissionOn)} · 30-day link
        {affiliate.visitorDiscountPercent ? ` · your visitors get ${affiliate.visitorDiscountPercent}% off` : ''}
      </p>
      {affiliate.status !== 'active' && (
        <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
          Your link is not earning new commission at the moment. What you have already earned is
          still yours to withdraw.
        </p>
      )}

      <nav aria-label="Affiliate sections" className="mt-8 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((entry) => (
          <Link
            key={entry.id}
            href={entry.id === 'overview' ? '/affiliate' : `/affiliate?tab=${entry.id}`}
            aria-current={tab === entry.id ? 'page' : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-[15px] transition-colors ${
              tab === entry.id ? 'border-accent text-ink' : 'border-transparent text-ink-dim hover:text-ink'
            }`}
          >
            {entry.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8">
        {tab === 'overview' && <OverviewTab affiliateId={affiliate.id} days={days} />}
        {tab === 'clients' && <ClientsTab affiliateId={affiliate.id} />}
        {tab === 'statement' && <StatementTab affiliateId={affiliate.id} days={days} />}
        {tab === 'links' && <LinksTab affiliateId={affiliate.id} slug={affiliate.slug} days={days} />}
        {tab === 'withdrawals' && <WithdrawalsTab affiliateId={affiliate.id} />}
        {tab === 'subs' && isMaster && <SubsTab affiliateId={affiliate.id} days={days} />}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------------------

async function OverviewTab({ affiliateId, days }: { affiliateId: string; days: Period }) {
  const [overview, balance] = await Promise.all([affiliateOverview(affiliateId, days), balanceForAffiliate(affiliateId)])
  const funnel = [
    { label: 'Clicks', value: overview.clicks },
    { label: 'Signed up', value: overview.signups },
    { label: 'Bought', value: overview.buyers },
  ]

  return (
    <div className="space-y-8">
      <PeriodPicker tab="overview" days={days} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Commission, ${periodLabel(days)}`} value={money(overview.commissionCents)} accent={overview.commissionCents > 0} />
        <Stat label="Sales you referred" value={money(overview.revenueCents)} hint="After tax and refunds" />
        <Stat label="Sales" value={String(overview.sales)} hint={`${overview.buyers} buying ${overview.buyers === 1 ? 'client' : 'clients'}`} />
        <Stat label="Click → sale" value={pct(percentOf(overview.sales, overview.clicks))} />
      </div>

      <section className="panel p-6">
        <h2 className="eyebrow mb-5">Funnel</h2>
        <ol className="space-y-3">
          {funnel.map((step, index) => {
            const widthPct = Math.max(overview.clicks > 0 ? (step.value / overview.clicks) * 100 : 0, step.value > 0 ? 2 : 0)
            const ofPrevious = index === 0 ? null : percentOf(step.value, funnel[index - 1].value)
            return (
              <li key={step.label} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3">
                <span className="text-[14px] text-ink-dim">{step.label}</span>
                <span className="h-3 overflow-hidden rounded-full bg-panel-2">
                  <span className="block h-full rounded-full bg-accent" style={{ width: `${widthPct}%` }} />
                </span>
                <span className="font-mono text-[14px] text-ink">
                  {step.value}
                  {ofPrevious !== null && <span className="ml-2 text-ink-dim">{ofPrevious}%</span>}
                </span>
              </li>
            )
          })}
        </ol>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartFrame title="Commission per day">
          <DailyBars points={overview.series.commission} format={money} label="Commission per day" />
        </ChartFrame>
        <ChartFrame title="Clicks per day">
          <DailyBars points={overview.series.clicks} label="Clicks per day" />
        </ChartFrame>
        <ChartFrame title="Sign-ups per day">
          <DailyBars points={overview.series.signups} label="Sign-ups per day" />
        </ChartFrame>
      </div>

      <Balances balance={balance} />
    </div>
  )
}

async function ClientsTab({ affiliateId }: { affiliateId: string }) {
  const clients = await affiliateClients(affiliateId)
  const buying = clients.filter((client) => client.orders > 0).length
  const revenue = clients.reduce((sum, client) => sum + client.revenueCents, 0)
  const subscribed = clients.filter((client) => client.subscribed).length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Clients" value={String(clients.length)} hint="Signed up or bought through you" />
        <Stat label="Buying clients" value={String(buying)} hint={`${pct(percentOf(buying, clients.length))} of clients`} />
        <Stat label="Sales from clients" value={money(revenue)} hint="After tax and refunds" />
        <Stat label="Subscribed now" value={String(subscribed)} />
      </div>

      <div className="panel relative overflow-x-auto">
        {clients.length === 0 ? (
          <p className="px-5 py-10 text-center text-[15px] text-ink-dim">
            Nobody has signed up or bought through your link yet.
          </p>
        ) : (
          <table className="w-full min-w-[52rem] text-left">
            <thead>
              <tr className="border-b border-line">
                <Th>Client</Th>
                <Th>Joined</Th>
                <Th>Via your link</Th>
                <Th>Country</Th>
                <Th right>Orders</Th>
                <Th right>Spent</Th>
                <Th right>Your commission</Th>
                <Th>Status</Th>
                <Th>Last active</Th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.key} className="border-b border-line/60 align-top last:border-0">
                  <td className="px-4 py-3">
                    <div className="text-[15px] text-ink">{client.name}</div>
                    <div className="font-mono text-[13px] text-ink-dim">{client.email}</div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[14px] text-ink-dim">{formatDate(client.joinedAt)}</td>
                  <td className="px-4 py-3 text-[14px] text-ink-dim">
                    <span className="whitespace-nowrap">{client.how === 'link' ? 'Signed up' : 'Bought'}</span>
                    {client.campaign && <div className="font-mono text-[12px] text-ink-dim">#{client.campaign}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-[14px] text-ink-dim">{client.country ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-[14px] text-ink">{client.orders}</td>
                  <td className="px-4 py-3 text-right font-mono text-[14px] text-ink">{client.orders ? money(client.revenueCents) : '—'}</td>
                  <td className="px-4 py-3 text-right font-mono text-[14px] text-ink">{client.orders ? money(client.commissionCents) : '—'}</td>
                  <td className="px-4 py-3">
                    {client.subscribed ? <Badge tone="accent">Subscribed</Badge> : <span className="whitespace-nowrap text-[14px] text-ink-dim">Not subscribed</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[14px] text-ink-dim">{client.lastActiveAt ? formatDate(client.lastActiveAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[14px] leading-relaxed text-ink-dim">
        For their privacy, clients are shown by first name and last initial with a masked email.
        Orders and amounts count only what they bought through your link.
      </p>
    </div>
  )
}

const STATUS_PILL: Record<StatementRow['status'], { label: string; tone: 'accent' | 'muted' }> = {
  held: { label: 'Held', tone: 'muted' },
  payable: { label: 'Payable', tone: 'accent' },
  refunded: { label: 'Refunded', tone: 'muted' },
  reversed: { label: 'Reversed', tone: 'muted' },
  paid_out: { label: 'Paid out', tone: 'muted' },
  adjusted: { label: 'Adjustment', tone: 'muted' },
}

async function StatementTab({ affiliateId, days }: { affiliateId: string; days: Period }) {
  const rows = await affiliateStatement(affiliateId, days)
  const sum = (status: StatementRow['status']) => rows.filter((row) => row.status === status).reduce((total, row) => total + row.amountCents, 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PeriodPicker tab="statement" days={days} />
        <a
          href={`/api/affiliate/statement?days=${days}`}
          className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-[14px] text-ink hover:border-accent/50"
        >
          <Download className="h-4 w-4" aria-hidden />
          Download CSV
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Held" value={money(sum('held'))} hint={`Inside the ${DEFAULT_HOLDBACK_DAYS}-day refund window`} />
        <Stat label="Payable" value={money(sum('payable'))} accent={sum('payable') > 0} />
        <Stat label="Reversed" value={money(sum('reversed'))} hint="Refunds" />
        <Stat label="Paid out" value={money(-sum('paid_out'))} />
      </div>

      <div className="panel relative overflow-x-auto">
        {rows.length === 0 ? (
          <p className="px-5 py-10 text-center text-[15px] text-ink-dim">Nothing on your account in the last {periodLabel(days)}.</p>
        ) : (
          <table className="w-full min-w-[60rem] text-left">
            <thead>
              <tr className="border-b border-line">
                <Th>Date</Th>
                <Th>Order</Th>
                <Th>Item</Th>
                <Th>Client</Th>
                <Th right>Sale</Th>
                <Th right>Rate</Th>
                <Th right>Amount</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line/60 align-top last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 text-[14px] text-ink-dim">{formatDate(row.at)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-[14px] text-ink-dim">{row.orderNumber ? `NS-${row.orderNumber}` : '—'}</td>
                  <td className="px-4 py-3 text-[14px] text-ink">
                    {row.items || (row.kind === 'payout' ? 'Withdrawal' : '—')}
                    {row.campaign && <div className="font-mono text-[12px] text-ink-dim">#{row.campaign}</div>}
                  </td>
                  <td className="px-4 py-3 text-[14px] text-ink-dim">
                    {row.via ? <span className="whitespace-nowrap">via {row.via}</span> : row.client ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-[14px] text-ink-dim">{row.saleCents === null ? '—' : money(row.saleCents)}</td>
                  <td className="px-4 py-3 text-right font-mono text-[14px] text-ink-dim">{row.ratePercent === null ? '—' : `${row.ratePercent}%${row.kind === 'override' ? ' override' : ''}`}</td>
                  <td className="px-4 py-3 text-right font-mono text-[14px] text-ink">{money(row.amountCents)}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <Badge tone={STATUS_PILL[row.status].tone}>{STATUS_PILL[row.status].label}</Badge>
                    {row.status === 'held' && row.payableAt && (
                      <div className="mt-1 text-[12px] text-ink-dim">from {formatDate(row.payableAt)}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-[14px] leading-relaxed text-ink-dim">
        Commission is worked out on the price before tax. It is held for {DEFAULT_HOLDBACK_DAYS} days in case
        the payment is refunded, and a refund takes it back.
      </p>
    </div>
  )
}

async function LinksTab({ affiliateId, slug, days }: { affiliateId: string; slug: string; days: Period }) {
  const [campaigns, experts] = await Promise.all([
    affiliateCampaigns(affiliateId, days),
    db.author.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { slug: true, name: true } }),
  ])
  const base = safeBase()
  const pages = [
    { path: '/join', label: 'Join page' },
    { path: '/', label: 'Home page' },
    { path: '/coverage', label: 'Coverage' },
    { path: '/experts', label: 'Subject matter experts' },
    ...experts.map((expert) => ({ path: `/experts/${expert.slug}`, label: expert.name })),
  ]

  return (
    <div className="space-y-8">
      <section className="panel p-6">
        <h2 className="eyebrow mb-4">Your link</h2>
        <AffiliateLink link={referralLink(base, slug)} />
        <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
          People who buy within 30 days of following any of your links earn you commission. The last link
          they followed is the one that counts.
        </p>
      </section>

      <section className="panel p-6">
        <h2 className="eyebrow mb-4">Build a tracked link</h2>
        <LinkBuilder base={base} slug={slug} pages={pages} />
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="eyebrow">Campaigns</h2>
          <PeriodPicker tab="links" days={days} />
        </div>
        <div className="panel relative overflow-x-auto">
          {campaigns.length === 0 ? (
            <p className="px-5 py-10 text-center text-[15px] text-ink-dim">No clicks in the last {periodLabel(days)}.</p>
          ) : (
            <table className="w-full min-w-[40rem] text-left">
              <thead>
                <tr className="border-b border-line">
                  <Th>Campaign</Th>
                  <Th right>Clicks</Th>
                  <Th right>Sign-ups</Th>
                  <Th right>Sales</Th>
                  <Th right>Click → sale</Th>
                  <Th right>Sales value</Th>
                  <Th right>Commission</Th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((row) => (
                  <tr key={row.campaign ?? ''} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3 font-mono text-[14px] text-ink">{row.campaign ? `#${row.campaign}` : <span className="text-ink-dim">No tag</span>}</td>
                    <td className="px-4 py-3 text-right font-mono text-[14px] text-ink">{row.clicks}</td>
                    <td className="px-4 py-3 text-right font-mono text-[14px] text-ink">{row.signups}</td>
                    <td className="px-4 py-3 text-right font-mono text-[14px] text-ink">{row.sales}</td>
                    <td className="px-4 py-3 text-right font-mono text-[14px] text-ink-dim">{pct(percentOf(row.sales, row.clicks))}</td>
                    <td className="px-4 py-3 text-right font-mono text-[14px] text-ink">{money(row.revenueCents)}</td>
                    <td className="px-4 py-3 text-right font-mono text-[14px] text-ink">{money(row.commissionCents)}</td>
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

async function SubsTab({ affiliateId, days }: { affiliateId: string; days: Period }) {
  const subs = await affiliateSubs(affiliateId, days)
  const active = subs.filter((sub) => sub.status === 'active').length
  const sum = (pick: (row: (typeof subs)[number]) => number) => subs.reduce((total, row) => total + pick(row), 0)

  return (
    <div className="space-y-6">
      <PeriodPicker tab="subs" days={days} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sub-affiliates" value={String(subs.length)} hint={`${active} active`} />
        <Stat label="Their sales" value={String(sum((row) => row.sales))} hint={periodLabel(days)} />
        <Stat label="Sales value" value={money(sum((row) => row.revenueCents))} hint="After tax and refunds" />
        <Stat label="Your override" value={money(sum((row) => row.overrideCents))} accent={sum((row) => row.overrideCents) > 0} />
      </div>

      <div className="panel relative overflow-x-auto">
        <table className="w-full min-w-[44rem] text-left">
          <thead>
            <tr className="border-b border-line">
              <Th>Partner</Th>
              <Th>Status</Th>
              <Th>Joined</Th>
              <Th right>Clicks</Th>
              <Th right>Sales</Th>
              <Th right>Sales value</Th>
              <Th right>Your override</Th>
            </tr>
          </thead>
          <tbody>
            {subs.map((sub) => (
              <tr key={sub.id} className="border-b border-line/60 last:border-0">
                <td className="px-4 py-3">
                  <div className="text-[15px] text-ink">{sub.name}</div>
                  <div className="font-mono text-[13px] text-ink-dim">{sub.slug}</div>
                </td>
                <td className="px-4 py-3">
                  <Badge tone={sub.status === 'active' ? 'accent' : 'muted'}>{sub.status}</Badge>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-[14px] text-ink-dim">{formatDate(sub.joinedAt)}</td>
                <td className="px-4 py-3 text-right font-mono text-[14px] text-ink">{sub.clicks}</td>
                <td className="px-4 py-3 text-right font-mono text-[14px] text-ink">{sub.sales}</td>
                <td className="px-4 py-3 text-right font-mono text-[14px] text-ink">{money(sub.revenueCents)}</td>
                <td className="px-4 py-3 text-right font-mono text-[14px] text-ink">
                  {money(sub.overrideCents)}
                  <div className="text-[12px] text-ink-dim">{sub.overridePercent}%</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[14px] leading-relaxed text-ink-dim">
        You earn an override on every sale your sub-affiliates make, on top of their own commission — it never comes out
        of theirs. It is a percent of the sale before tax, held {DEFAULT_HOLDBACK_DAYS} days like your commission, and a
        refund takes it back. Their clients stay theirs, so they are not listed here.
      </p>
    </div>
  )
}

async function WithdrawalsTab({ affiliateId }: { affiliateId: string }) {
  const [balance, payouts] = await Promise.all([
    balanceForAffiliate(affiliateId),
    db.payout.findMany({
      where: { affiliateId },
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
    <div className="space-y-8">
      <section className="panel p-6">
        <h2 className="eyebrow mb-5">Earnings</h2>
        <BalanceTiles balance={balance} free={free} />
        <p className="mt-4 text-[14px] leading-relaxed text-ink-dim">
          Commission is held for {DEFAULT_HOLDBACK_DAYS} days after each payment, in case it is refunded.
          A refunded payment takes its commission back.
          {pendingCents > 0 ? ` ${formatPrice(pendingCents)} is on a withdrawal already in progress.` : ''}
        </p>
        <WithdrawalForm availableCents={free} />
      </section>

      <section>
        <h2 className="eyebrow mb-3">Withdrawals</h2>
        <div className="panel overflow-x-auto">
          {payouts.length === 0 ? (
            <p className="px-5 py-8 text-center text-[15px] text-ink-dim">No withdrawals yet.</p>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-line">
                  <Th>Asked</Th>
                  <Th>Amount</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody>
                {payouts.map((payout) => (
                  <tr key={payout.id} className="border-b border-line/60 last:border-0">
                    <td className="whitespace-nowrap px-4 py-3 text-[15px] text-ink-dim">{formatDate(payout.createdAt)}</td>
                    <td className="px-4 py-3 font-mono text-[15px] text-ink">{formatPrice(payout.amountCents)}</td>
                    <td className="px-4 py-3 text-[15px] text-ink-dim">
                      {PAYOUT_LABEL[payout.status] ?? payout.status}
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

// ---------------------------------------------------------------------------------------

type BalanceShape = Awaited<ReturnType<typeof balanceForAffiliate>>

function Balances({ balance }: { balance: BalanceShape }) {
  return (
    <section className="panel p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="eyebrow">Your balance</h2>
        <Link href="/affiliate?tab=withdrawals" className="text-[14px] text-accent-ink hover:underline">
          Withdraw →
        </Link>
      </div>
      <BalanceTiles balance={balance} free={Math.max(0, balance.availableCents)} />
    </section>
  )
}

function BalanceTiles({ balance, free }: { balance: BalanceShape; free: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Earned" value={formatPrice(balance.earnedCents)} />
      <Stat label={`Held (${DEFAULT_HOLDBACK_DAYS} days)`} value={formatPrice(balance.heldCents)} />
      <Stat label="Available" value={formatPrice(free)} accent={free > 0} />
      <Stat label="Paid out" value={formatPrice(balance.paidCents)} />
    </div>
  )
}

function PeriodPicker({ tab, days }: { tab: Tab; days: Period }) {
  return (
    <div role="group" aria-label="Period" className="inline-flex rounded-full border border-line p-1">
      {PERIODS.map((period) => (
        <Link
          key={period}
          href={`/affiliate?tab=${tab}&days=${period}`}
          aria-current={period === days ? 'true' : undefined}
          className={`rounded-full px-3 py-1.5 font-mono text-[13px] ${
            period === days ? 'bg-accent text-on-accent' : 'text-ink-dim hover:text-ink'
          }`}
        >
          {period === 365 ? '1y' : `${period}d`}
        </Link>
      ))}
    </div>
  )
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <th className={`eyebrow whitespace-nowrap px-4 py-3 ${right ? 'text-right' : ''}`}>{children}</th>
}

function money(cents: number): string {
  return cents < 0 ? `−${formatPrice(-cents)}` : formatPrice(cents)
}

function pct(value: number | null): string {
  return value === null ? '—' : `${value}%`
}

function safeBase(): string {
  try {
    return appBaseUrl()
  } catch {
    return ''
  }
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-4 py-3">
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">{label}</div>
      <div className={`mt-1 font-mono text-xl ${accent ? 'text-accent-ink' : 'text-ink'}`}>{value}</div>
      {hint && <div className="mt-1 text-[12px] text-ink-dim">{hint}</div>}
    </div>
  )
}
