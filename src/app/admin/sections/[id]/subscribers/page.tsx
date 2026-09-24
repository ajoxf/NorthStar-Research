import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  ACCESS_SOURCE_LABEL,
  ACCESS_STATE_LABEL,
  accessSource,
  accessState,
  daysUntil,
} from '@/lib/access-view'
import { isAllAccess } from '@/lib/entitlements'
import { sectionName } from '@/lib/section-shape'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Who holds this section' }
export const dynamic = 'force-dynamic'

/**
 * Who can read one section, and on what basis.
 *
 * The other half of the member page's access panel: that answers "what does this person
 * hold", this answers "who holds this thing". An operator needs both and for different
 * jobs — the first when somebody writes in, the second before changing a price, retiring
 * a subject, or working out whether anybody would notice.
 *
 * **All-access members are counted separately and are not in the table.** They can read
 * this section without holding an entitlement for it, so a list built from entitlements
 * alone silently understates the audience — which is the number that matters when the
 * question is "will anyone notice if I retire this". They are a figure rather than a list
 * because they are not subscribers *to this*: they are people who read everything.
 */
export default async function SectionSubscribersPage({ params }: { params: { id: string } }) {
  await requireAdmin()

  const section = await db.section.findUnique({
    where: { id: params.id },
    include: {
      topic: true,
      author: true,
      entitlements: {
        orderBy: [{ renewsAt: 'desc' }],
        include: {
          member: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              subscriptionStatus: true,
              subscriptionRenewsAt: true,
            },
          },
        },
      },
    },
  })
  if (!section) notFound()

  const now = new Date()
  const rows = section.entitlements.map((entitlement) => ({
    id: entitlement.id,
    member: entitlement.member,
    state: accessState(entitlement, now),
    source: accessSource(entitlement),
    renewsAt: entitlement.renewsAt,
    daysLeft: daysUntil(entitlement.renewsAt, now),
  }))

  const live = rows.filter((row) => row.state === 'live' || row.state === 'open-ended')

  /*
   * How many read this without holding it.
   *
   * Counted rather than listed, and counted over members who are not admins: every admin
   * reads everything by definition, and including them would inflate a figure an operator
   * is about to make a decision on.
   */
  const allAccessCount = await db.member
    .findMany({
      where: { role: 'member' },
      select: { role: true, subscriptionStatus: true, subscriptionRenewsAt: true },
    })
    .then((members) => members.filter((member) => isAllAccess(member, now)).length)

  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <Link
        href="/admin/sections"
        className="mb-6 inline-flex items-center gap-1.5 font-mono text-[12px] text-ink-dim hover:text-ink"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden />
        All sections
      </Link>

      <h1 className="text-2xl text-ink">{sectionName(section)}</h1>
      <p className="mt-1 font-mono text-[12px] text-ink-dim">/{section.slug}</p>

      <dl className="mt-7 grid gap-4 rounded-lg border border-line bg-panel p-5 sm:grid-cols-3">
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
            Holding it now
          </dt>
          <dd className="mt-1 font-display text-2xl text-ink">{live.length}</dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
            Ever held it
          </dt>
          <dd className="mt-1 font-display text-2xl text-ink">{rows.length}</dd>
        </div>
        <div>
          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
            Reading on all-access
          </dt>
          <dd className="mt-1 font-display text-2xl text-ink">{allAccessCount}</dd>
          <p className="mt-1 text-[12px] leading-relaxed text-ink-dim">
            Not in the list below. They read every section regardless of what they hold.
          </p>
        </div>
      </dl>

      {rows.length === 0 ? (
        <p className="mt-8 text-[15px] text-ink-dim">
          Nobody has ever held this section
          {allAccessCount > 0 ? (
            <>
              {' '}
              on its own. {allAccessCount} member{allAccessCount === 1 ? '' : 's'} can still read
              it on the all-access membership.
            </>
          ) : (
            '.'
          )}
        </p>
      ) : (
        <div className="mt-8 overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[720px] text-left text-[13px]">
            <thead className="bg-panel font-mono text-[11px] uppercase tracking-[0.1em] text-ink-dim">
              <tr>
                <th className="px-4 py-2.5 font-medium">Member</th>
                <th className="px-4 py-2.5 font-medium">State</th>
                <th className="px-4 py-2.5 font-medium">Came from</th>
                <th className="px-4 py-2.5 font-medium">Renews</th>
                <th className="px-4 py-2.5 font-medium">Also all-access</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => {
                const name = [row.member.firstName, row.member.lastName].filter(Boolean).join(' ')
                return (
                  <tr key={row.id}>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/members/${row.member.id}`}
                        className="text-ink underline underline-offset-4 hover:text-accent"
                      >
                        {name || row.member.email}
                      </Link>
                      {name && (
                        <div className="font-mono text-[11px] text-ink-dim">{row.member.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={
                          row.state === 'live'
                            ? 'up'
                            : row.state === 'open-ended'
                              ? 'accent'
                              : row.state === 'pending'
                                ? 'muted'
                                : 'down'
                        }
                      >
                        {ACCESS_STATE_LABEL[row.state]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-ink-dim">{ACCESS_SOURCE_LABEL[row.source]}</td>
                    <td className="px-4 py-3 text-ink-dim">
                      {row.renewsAt ? (
                        <>
                          {formatDate(row.renewsAt)}
                          {row.daysLeft !== null && (
                            <span className="ml-2 font-mono text-[11px]">
                              {row.daysLeft >= 0 ? `${row.daysLeft}d left` : `${-row.daysLeft}d ago`}
                            </span>
                          )}
                        </>
                      ) : (
                        'Never'
                      )}
                    </td>
                    {/*
                      Flagged per row, because it changes what a lapsed entitlement means.
                      Somebody whose section grant expired but who holds all-access has not
                      lost anything and will not have noticed — chasing them for a renewal
                      would be chasing somebody who is already reading it.
                    */}
                    <td className="px-4 py-3 text-ink-dim">
                      {isAllAccess(row.member, now) ? 'Yes' : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
