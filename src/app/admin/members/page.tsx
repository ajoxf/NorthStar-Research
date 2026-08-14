import Link from 'next/link'
import type { Metadata } from 'next'
import type { Prisma, SubscriptionStatus } from '@prisma/client'

import { Badge, statusTone } from '@/components/ui/badge'
import { MemberFilters } from '@/app/admin/members/member-filters'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { formatDate, fullName } from '@/lib/utils'

export const metadata: Metadata = { title: 'Members' }
export const dynamic = 'force-dynamic'

const STATUSES: (SubscriptionStatus | 'all')[] = ['all', 'active', 'pending', 'expired', 'cancelled']

/**
 * The CRM list view (build spec §5.3): every member, their status, channels, last
 * activity and engagement counts, filterable and exportable.
 */
export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: { status?: string; q?: string; tag?: string }
}) {
  await requireAdmin()

  const status = STATUSES.includes(searchParams.status as never)
    ? (searchParams.status as SubscriptionStatus | 'all')
    : 'all'
  const query = searchParams.q?.trim() ?? ''
  const tag = searchParams.tag?.trim() ?? ''

  const where: Prisma.MemberWhereInput = {
    ...(status !== 'all' ? { subscriptionStatus: status } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
    ...(query
      ? {
          OR: [
            { email: { contains: query, mode: 'insensitive' } },
            { firstName: { contains: query, mode: 'insensitive' } },
            { lastName: { contains: query, mode: 'insensitive' } },
            { phoneNumber: { contains: query } },
          ],
        }
      : {}),
  }

  const [members, total, allTags] = await Promise.all([
    db.member.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { _count: { select: { reportViews: true, deliveryLogs: true } } },
    }),
    db.member.count({ where }),
    db.member.findMany({ select: { tags: true }, take: 500 }),
  ])

  const tagOptions = Array.from(new Set(allTags.flatMap((member) => member.tags))).sort()

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-6">
        <h1 className="font-mono text-xl text-ink">Members</h1>
        <p className="mt-1 font-mono text-[12px] text-ink-dim">
          {total} matching {total === 1 ? 'member' : 'members'}
          {members.length < total && ` · showing the ${members.length} most recent`}
        </p>
      </div>

      <MemberFilters status={status} query={query} tag={tag} tagOptions={tagOptions} />

      <div className="mt-5 overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full min-w-[880px] text-left">
          <thead>
            <tr className="border-b border-line font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
              <th className="px-5 py-3 font-medium">Member</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Channels</th>
              <th className="px-5 py-3 font-medium">Joined</th>
              <th className="px-5 py-3 font-medium">Last login</th>
              <th className="px-5 py-3 font-medium">Last read</th>
              <th className="px-5 py-3 font-medium">Sent / read</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-12 text-center font-mono text-[13px] text-ink-dim">
                  {total === 0 && !query && status === 'all'
                    ? 'No members yet. They appear here as soon as a payment confirms.'
                    : 'No members match those filters.'}
                </td>
              </tr>
            ) : (
              members.map((member) => (
                <tr key={member.id} className="border-b border-line last:border-b-0 hover:bg-panel-2">
                  <td className="px-5 py-3.5">
                    <Link href={`/admin/members/${member.id}`} className="block hover:text-accent">
                      <span className="block text-[14px] text-ink">{member.email}</span>
                      {fullName(member) && (
                        <span className="block font-mono text-[11px] text-ink-dim">
                          {fullName(member)}
                        </span>
                      )}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <Badge tone={statusTone(member.subscriptionStatus)}>
                      {member.subscriptionStatus}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone="muted">Email</Badge>
                      {member.whatsappOptIn && (
                        <Badge tone={member.whatsappVerified ? 'up' : 'accent'}>
                          {member.whatsappVerified ? 'WhatsApp' : 'WA unverified'}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 font-mono text-[12px] text-ink-dim">
                    {formatDate(member.createdAt)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 font-mono text-[12px] text-ink-dim">
                    {member.lastLoginAt ? formatDate(member.lastLoginAt) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 font-mono text-[12px] text-ink-dim">
                    {member.lastReportViewedAt ? formatDate(member.lastReportViewedAt) : '—'}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3.5 font-mono text-[12px] text-ink-dim">
                    {member._count.deliveryLogs} / {member._count.reportViews}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
