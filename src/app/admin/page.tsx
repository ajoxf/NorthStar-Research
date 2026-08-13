import Link from 'next/link'
import type { Metadata } from 'next'

import { Badge } from '@/components/ui/badge'
import { ButtonLink } from '@/components/ui/button'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { cregisConfigured } from '@/lib/cregis'
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
        <Stat label="Sends this week" value={sentThisWeek} hint="email + WhatsApp" />
      </div>

      <ConfigurationPanel providers={providers} />

      <section className="mt-8">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-mono text-[13px] uppercase tracking-[0.12em] text-ink-dim">
            Recent uploads
          </h2>
          <Link href="/admin/reports" className="font-mono text-[12px] text-gold hover:underline">
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
                <span className="w-28 shrink-0 font-mono text-[12px] text-ink-dim">
                  {formatDate(report.publishDate)}
                </span>
                <span className="w-40 shrink-0 truncate font-mono text-[12px] text-gold">
                  {reportTypeLabel(report.type)}
                </span>
                <span className="flex-1 truncate text-[14px] text-ink">{report.title}</span>
                <Badge tone={report.published ? 'up' : 'muted'}>
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
 */
function ConfigurationPanel({ providers }: { providers: { email: string; whatsapp: string } }) {
  const rows = [
    {
      label: 'Crypto checkout (Cregis)',
      ready: cregisConfigured(),
      detail: cregisConfigured()
        ? 'Credentials set'
        : 'Placeholder credentials — checkout will refuse to run',
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
      label: 'WhatsApp delivery',
      ready: providers.whatsapp !== 'console',
      detail:
        providers.whatsapp === 'console'
          ? 'No provider configured — sends are logged, not delivered'
          : `Sending via ${providers.whatsapp}`,
    },
    {
      label: 'File storage (Vercel Blob)',
      ready: isConfigured('BLOB_READ_WRITE_TOKEN'),
      detail: isConfigured('BLOB_READ_WRITE_TOKEN')
        ? 'Token set'
        : 'No token — PDF uploads will fail',
    },
    {
      label: 'Cregis static outbound IP',
      ready: isConfigured('CREGIS_ALLOWLISTED_IP'),
      detail: isConfigured('CREGIS_ALLOWLISTED_IP')
        ? process.env.CREGIS_ALLOWLISTED_IP ?? ''
        : 'Open pre-launch decision — see README',
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
            <Badge tone={row.ready ? 'up' : 'gold'}>{row.ready ? 'Ready' : 'Not configured'}</Badge>
            <span className="text-[14px] text-ink">{row.label}</span>
            <span className="ml-auto font-mono text-[12px] text-ink-dim">{row.detail}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
