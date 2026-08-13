import Link from 'next/link'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { MemberCrmPanel } from '@/app/admin/members/[id]/member-crm-panel'
import { Badge, statusTone } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { reportTypeLabel } from '@/lib/report-content'
import { formatDate, formatDateTime, fullName } from '@/lib/utils'

export const metadata: Metadata = { title: 'Member' }
export const dynamic = 'force-dynamic'

/**
 * CRM detail view: the member's record plus their full delivery and view history —
 * the "sent 3 reports this week, opened 2" picture the build spec asks for.
 */
export default async function AdminMemberDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin()

  const member = await db.member.findUnique({
    where: { id: params.id },
    include: {
      deliveryLogs: {
        orderBy: { sentAt: 'desc' },
        take: 50,
        include: { report: { select: { title: true, type: true } } },
      },
      reportViews: {
        orderBy: { viewedAt: 'desc' },
        take: 50,
        include: { report: { select: { title: true, type: true } } },
      },
      redemptionCodes: true,
    },
  })
  if (!member) notFound()

  // Distinct IPs are the signal behind the §7 sharing mitigations — many devices on one
  // account is what an admin would want to look at, not proof of anything on its own.
  const distinctIps = new Set(
    member.reportViews.map((view) => view.ipAddress).filter((ip): ip is string => Boolean(ip)),
  )

  return (
    <div className="mx-auto max-w-4xl px-5 py-10">
      <Link
        href="/admin/members"
        className="mb-6 inline-flex items-center gap-1.5 font-mono text-[12px] text-ink-dim hover:text-ink"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden />
        All members
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl text-ink">{fullName(member) || member.email}</h1>
          <p className="mt-1 font-mono text-[12px] text-ink-dim">{member.email}</p>
        </div>
        <Badge tone={statusTone(member.subscriptionStatus)}>{member.subscriptionStatus}</Badge>
      </div>

      <dl className="mt-7 grid gap-4 rounded-lg border border-line bg-panel p-5 sm:grid-cols-3">
        <Detail label="Joined" value={formatDate(member.createdAt)} />
        <Detail
          label="Subscription started"
          value={member.subscriptionStartedAt ? formatDate(member.subscriptionStartedAt) : '—'}
        />
        <Detail label="Source" value={member.source} />
        <Detail label="Phone" value={member.phoneNumber ?? '—'} />
        <Detail
          label="WhatsApp"
          value={
            member.whatsappOptIn
              ? member.whatsappVerified
                ? 'Opted in, verified'
                : 'Opted in, not verified'
              : 'Off'
          }
        />
        <Detail label="Last login" value={member.lastLoginAt ? formatDateTime(member.lastLoginAt) : '—'} />
        <Detail label="Messages sent" value={String(member.deliveryLogs.length)} />
        <Detail label="Reports opened" value={String(member.reportViews.length)} />
        <Detail label="Distinct IPs" value={String(distinctIps.size)} />
      </dl>

      <MemberCrmPanel
        member={{
          id: member.id,
          subscriptionStatus: member.subscriptionStatus,
          tags: member.tags,
          adminNotes: member.adminNotes,
        }}
      />

      {member.redemptionCodes.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-mono text-[13px] uppercase tracking-[0.12em] text-ink-dim">
            Redemption codes
          </h2>
          <div className="rounded-lg border border-line bg-panel">
            {member.redemptionCodes.map((code) => (
              <div
                key={code.id}
                className="flex items-center gap-4 border-b border-line px-5 py-3 last:border-b-0"
              >
                <span className="font-mono text-[13px] text-gold">{code.code}</span>
                <Badge tone={code.status === 'redeemed' ? 'up' : 'muted'}>{code.status}</Badge>
                <span className="ml-auto font-mono text-[11px] text-ink-dim">
                  {code.redeemedAt ? `Redeemed ${formatDate(code.redeemedAt)}` : `Issued ${formatDate(code.createdAt)}`}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 font-mono text-[13px] uppercase tracking-[0.12em] text-ink-dim">
          Delivery history
        </h2>
        <div className="rounded-lg border border-line bg-panel">
          {member.deliveryLogs.length === 0 ? (
            <p className="px-5 py-8 text-center font-mono text-[13px] text-ink-dim">
              Nothing sent to this member yet.
            </p>
          ) : (
            member.deliveryLogs.map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-b-0"
              >
                <Badge tone={statusTone(log.status)}>{log.status}</Badge>
                <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim">
                  {log.channel}
                </span>
                <span className="flex-1 truncate text-[13px] text-ink">{log.report.title}</span>
                <span className="font-mono text-[11px] text-ink-dim">
                  {formatDateTime(log.sentAt)}
                </span>
                {log.error && (
                  <span className="w-full font-mono text-[11px] text-down">{log.error}</span>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-mono text-[13px] uppercase tracking-[0.12em] text-ink-dim">
          Report views
        </h2>
        <div className="rounded-lg border border-line bg-panel">
          {member.reportViews.length === 0 ? (
            <p className="px-5 py-8 text-center font-mono text-[13px] text-ink-dim">
              This member has not opened a report yet.
            </p>
          ) : (
            member.reportViews.map((view) => (
              <div
                key={view.id}
                className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3 last:border-b-0"
              >
                <span className="font-mono text-[11px] text-gold">
                  {reportTypeLabel(view.report.type)}
                </span>
                <span className="flex-1 truncate text-[13px] text-ink">{view.report.title}</span>
                {view.downloaded && <Badge tone="gold">Downloaded</Badge>}
                <span className="font-mono text-[11px] text-ink-dim">{view.ipAddress ?? '—'}</span>
                <span className="font-mono text-[11px] text-ink-dim">
                  {formatDateTime(view.viewedAt)}
                </span>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">{label}</dt>
      <dd className="mt-1 break-words font-mono text-[13px] text-ink">{value}</dd>
    </div>
  )
}
