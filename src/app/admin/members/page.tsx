import Link from 'next/link'
import type { Metadata } from 'next'

import { ActivateMemberButton } from '@/app/admin/members/member-status-action'
import { Badge, statusTone } from '@/components/ui/badge'
import { MemberFilters } from '@/app/admin/members/member-filters'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  ENGAGEMENT,
  ENGAGEMENT_LABELS,
  SOURCES,
  SOURCE_LABELS,
  isFiltered,
  parseSegment,
  segmentWhere,
} from '@/lib/member-segments'
import { formatDate, fullName } from '@/lib/utils'

export const metadata: Metadata = { title: 'Members' }
export const dynamic = 'force-dynamic'

/**
 * The CRM list view (build spec §5.3): every member, their status, channels, last
 * activity and engagement counts, filterable and exportable.
 */
export default async function AdminMembersPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>
}) {
  await requireAdmin()

  const segment = parseSegment(searchParams)
  const where = segmentWhere(segment)

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

      <MemberFilters
        status={segment.status}
        query={segment.search ?? ''}
        tag={segment.tag ?? ''}
        source={segment.source}
        engagement={segment.engagement}
        tagOptions={tagOptions}
        sourceOptions={SOURCES.map((value) => ({ value, label: SOURCE_LABELS[value] }))}
        engagementOptions={ENGAGEMENT.map((value) => ({ value, label: ENGAGEMENT_LABELS[value] }))}
      />

      {isFiltered(segment) && (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-ink-dim">
          <span>Segment:</span>
          {[
            segment.status !== 'all' ? segment.status : null,
            segment.source !== 'all' ? SOURCE_LABELS[segment.source] : null,
            segment.engagement !== 'all' ? ENGAGEMENT_LABELS[segment.engagement] : null,
            segment.tag ? `tag: ${segment.tag}` : null,
            segment.search ? `"${segment.search}"` : null,
          ]
            .filter(Boolean)
            .map((label) => (
              <span key={label as string} className="rounded border border-line px-2 py-0.5 font-mono text-[11px] text-ink">
                {label}
              </span>
            ))}
          <Link href="/admin/members" className="text-accent underline underline-offset-4">
            Clear
          </Link>
        </p>
      )}

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
                  {total === 0 && !isFiltered(segment)
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
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone(member.subscriptionStatus)}>
                        {member.subscriptionStatus}
                      </Badge>
                      {/*
                        Shown only where it changes something. An "Activate" button beside
                        an already-active member is noise that trains an operator to stop
                        reading the column.
                      */}
                      {member.subscriptionStatus !== 'active' && (
                        <ActivateMemberButton memberId={member.id} email={member.email} />
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone="muted">Email</Badge>
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
