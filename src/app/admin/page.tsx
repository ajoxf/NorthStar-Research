import Link from 'next/link'
import type { Metadata } from 'next'

import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { EngagementPanel } from '@/app/admin/engagement-panel'
import { cregisConfigured } from '@/lib/cregis'
import { stripeConfigured } from '@/lib/stripe'
import { googleConfigured } from '@/lib/oauth'
import { providerNames } from '@/lib/notifications'
import { isConfigured } from '@/lib/env'
import { reportTypeLabel } from '@/lib/report-content'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Admin' }
export const dynamic = 'force-dynamic'

export default async function AdminDashboard() {
  await requireAdmin()

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const [
    activeMembers,
    pendingMembers,
    lapsedMembers,
    reportCount,
    recentReports,
    sentThisWeek,
    unusedCodes,
  ] = await Promise.all([
    db.member.count({ where: { subscriptionStatus: 'active', role: 'member' } }),
    db.member.count({ where: { subscriptionStatus: 'pending' } }),
    db.member.count({ where: { subscriptionStatus: { in: ['expired', 'cancelled'] } } }),
    db.report.count(),
    db.report.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, type: true, title: true, publishDate: true, published: true },
    }),
    db.deliveryLog.count({ where: { sentAt: { gte: weekAgo }, status: { not: 'failed' } } }),
    db.redemptionCode.count({ where: { status: 'unused' } }),
  ])

  const providers = providerNames()

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-mono text-xl text-ink">Overview</h1>
          <p className="mt-1 font-mono text-[12px] text-ink-dim">
            Members, reports and delivery at a glance.
          </p>
        </div>
        <ButtonLink href="/admin/reports/new" size="sm">
          Upload a report
        </ButtonLink>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active members" value={activeMembers} />
        <Stat label="Paid, not yet redeemed" value={pendingMembers} hint={`${unusedCodes} unused codes`} />
        <Stat label="Lapsed / cancelled" value={lapsedMembers} />
        <Stat label="Sends this week" value={sentThisWeek} hint="report emails" />
      </div>

      <ConfigurationPanel providers={providers} />

      <EngagementPanel />

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-mono text-[13px] uppercase tracking-[0.12em] text-ink-dim">
            Recent uploads
          </h2>
          <Link href="/admin/reports" className="font-mono text-[12px] text-accent hover:underline">
            All {reportCount} reports
          </Link>
        </div>

        <div className="rounded-lg border border-line bg-panel">
          {recentReports.length === 0 ? (
            <p className="px-5 py-10 text-center font-mono text-[13px] text-ink-dim">
              No reports uploaded yet.
            </p>
          ) : (
            recentReports.map((report) => (
              <Link
                key={report.id}
                href={`/admin/reports/${report.id}`}
                className="flex items-center gap-4 border-b border-line px-5 py-3.5 last:border-b-0 hover:bg-panel-2"
              >
                {/*
                  Two fixed-width columns plus a badge came to more than a phone's width,
                  so this row scrolled the whole overview sideways. The date and type are
                  the least useful parts at that size — the archive is one tap away — so
                  they drop out below sm, and the title takes the room.
                */}
                <span className="hidden w-28 shrink-0 font-mono text-[12px] text-ink-dim sm:block">
                  {formatDate(report.publishDate)}
                </span>
                <span className="hidden w-40 shrink-0 truncate font-mono text-[12px] text-accent sm:block">
                  {reportTypeLabel(report.type)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{report.title}</span>
                <Badge tone={report.published ? 'up' : 'muted'} className="shrink-0">
                  {report.published ? 'Published' : 'Draft'}
                </Badge>
              </Link>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">{label}</div>
      <div className="mt-2 font-mono text-3xl text-ink">{value}</div>
      {hint && <div className="mt-1 font-mono text-[11px] text-ink-dim">{hint}</div>}
    </div>
  )
}

/**
 * Configuration status.
 *
 * The build ships with placeholder credentials on purpose, so the console states plainly
 * which integrations are live and which are not — the failure mode to avoid is an admin
 * assuming reports went out when delivery was only ever logging to the console.
 *
 * Only integrations the product actually uses appear here. WhatsApp delivery and the
 * Cregis static outbound IP are both descoped; a permanently amber row for something
 * nobody intends to configure trains an operator to ignore the panel, which is exactly
 * what it exists to prevent.
 */
async function ConfigurationPanel({ providers }: { providers: { email: string } }) {
  const cregisReady = await cregisConfigured()

  const rows = [
    {
      label: 'Card billing (Stripe)',
      ready: stripeConfigured(),
      detail: stripeConfigured()
        ? 'Subscriptions renew automatically'
        : 'Not configured — card checkout will refuse to run',
    },
    {
      label: 'Crypto checkout (Cregis)',
      ready: cregisReady,
      detail: cregisReady
        ? 'Credentials set — renewals are manual'
        : 'Placeholder credentials — checkout will refuse to run',
    },
    {
      label: 'Google sign-in',
      ready: googleConfigured(),
      detail: googleConfigured()
        ? 'Enabled on the sign-in page'
        : 'Credentials missing — the button is shown but returns an error',
    },
    {
      label: 'Email delivery',
      ready: providers.email !== 'console',
      detail:
        providers.email === 'console'
          ? 'No provider configured — sends are logged, not delivered'
          : `Sending via ${providers.email}`,
    },
    {
      label: 'File storage (Vercel Blob)',
      ready: isConfigured('BLOB_READ_WRITE_TOKEN'),
      detail: isConfigured('BLOB_READ_WRITE_TOKEN')
        ? 'Token set'
        : 'No token — PDF uploads will fail',
    },
  ]

  return (
    <section className="mt-8">
      <h2 className="mb-3 font-mono text-[13px] uppercase tracking-[0.12em] text-ink-dim">
        Integration status
      </h2>

      <div className="rounded-lg border border-line bg-panel">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5 last:border-b-0"
          >
            {/*
              `shrink-0` on the badge and `min-w-0` on the text: without them the detail
              string, which never wraps, pushed this row past the viewport and scrolled the
              whole overview sideways on a phone. Pre-dates the engagement panel below.
            */}
            <Badge tone={row.ready ? 'up' : 'accent'} className="shrink-0">
              {row.ready ? 'Ready' : 'Not configured'}
            </Badge>
            <span className="text-[14px] text-ink">{row.label}</span>
            <span className="min-w-0 font-mono text-[12px] text-ink-dim sm:ml-auto">
              {row.detail}
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
