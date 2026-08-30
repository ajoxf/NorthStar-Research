import 'server-only'

import { db } from '@/lib/db'
import {
  type AudienceCounts,
  type AudienceRow,
  classifyAudience,
  countAudience,
} from '@/lib/audience-shape'

/**
 * Every member's standing on one report, by name.
 *
 * The aggregate panels answer "how many read it". This answers "who", which is the
 * question that leads to an action — a call, a nudge, a conversation about renewal.
 *
 * Three sources are merged rather than one being taken as authoritative:
 *
 *   - **DeliveryLog** — who it was sent to, and what the provider said.
 *   - **ReportView** — who actually opened it in the portal.
 *   - **Member** — active members with neither, who therefore never got the chance.
 *
 * That last group matters and is easy to omit. A member who joined the day after a
 * report went out has not ignored it; showing them as an unread recipient would
 * overstate apathy and understate the read rate every week.
 */

export type ReportAudience = {
  rows: AudienceRow[]
  counts: AudienceCounts
}

export async function reportAudience(reportId: string): Promise<ReportAudience> {
  const [logs, views, activeMembers] = await Promise.all([
    db.deliveryLog.findMany({
      where: { reportId },
      select: {
        memberId: true,
        status: true,
        sentAt: true,
        error: true,
        member: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    }),
    db.reportView.findMany({
      where: { reportId },
      select: {
        memberId: true,
        viewedAt: true,
        member: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    }),
    db.member.findMany({
      where: { role: 'member', subscriptionStatus: 'active' },
      select: { id: true, email: true, firstName: true, lastName: true },
    }),
  ])

  type Person = { id: string; email: string; firstName: string | null; lastName: string | null }
  const people = new Map<string, Person>()
  const deliveryByMember = new Map<string, { status: string; sentAt: Date; error: string | null }>()
  // Earliest view: when they first read it, not the last time they re-opened it.
  const firstViewByMember = new Map<string, Date>()

  for (const log of logs) {
    people.set(log.memberId, log.member)
    const existing = deliveryByMember.get(log.memberId)
    // A member can hold more than one row per report once a channel or a retry is
    // involved. The furthest-along status is the true one — a later `opened` must not be
    // overwritten by an earlier `sent` just because of row order.
    if (!existing || rank(log.status) > rank(existing.status)) {
      deliveryByMember.set(log.memberId, {
        status: log.status,
        sentAt: log.sentAt,
        error: log.error,
      })
    }
  }

  for (const view of views) {
    people.set(view.memberId, view.member)
    const existing = firstViewByMember.get(view.memberId)
    if (!existing || view.viewedAt < existing) firstViewByMember.set(view.memberId, view.viewedAt)
  }

  // Active members who appear in neither: never sent, so never had the chance.
  for (const member of activeMembers) {
    if (!people.has(member.id)) people.set(member.id, member)
  }

  const rows: AudienceRow[] = [...people.values()].map((person) => {
    const delivery = deliveryByMember.get(person.id) ?? null
    const viewedAt = firstViewByMember.get(person.id) ?? null

    return {
      memberId: person.id,
      email: person.email,
      name: [person.firstName, person.lastName].filter(Boolean).join(' ') || null,
      state: classifyAudience({
        hasView: viewedAt !== null,
        deliveryStatus: delivery?.status ?? null,
      }),
      viewedAt,
      sentAt: delivery?.sentAt ?? null,
      // Only meaningful on a failure; a succeeded row carries no error to show.
      error: delivery?.status === 'failed' ? (delivery.error ?? null) : null,
    }
  })

  // Readers first, and most recent read at the top — the useful end of the list.
  rows.sort((a, b) => {
    if (a.viewedAt && b.viewedAt) return b.viewedAt.getTime() - a.viewedAt.getTime()
    if (a.viewedAt) return -1
    if (b.viewedAt) return 1
    return a.email.localeCompare(b.email)
  })

  return { rows, counts: countAudience(rows) }
}

/** How far along a delivery status is. Higher wins when a member has several rows. */
function rank(status: string): number {
  switch (status) {
    case 'clicked':
      return 5
    case 'opened':
      return 4
    case 'delivered':
      return 3
    case 'sent':
      return 2
    case 'queued':
      return 1
    // Failure is the weakest claim, not the strongest: a later successful retry should
    // win over it, and a member with both was ultimately reached.
    case 'failed':
      return 0
    default:
      return 1
  }
}
