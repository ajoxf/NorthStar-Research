import 'server-only'

import type { SubscriptionStatus } from '@prisma/client'

import { db } from '@/lib/db'
import { maskEmail, maskName } from '@/lib/partner-report-shape'
import { sectionName } from '@/lib/section-shape'

export type ExpertSubscriber = {
  id: string
  name: string
  email: string
  section: string
  country: string | null
  since: Date
  renewsAt: Date | null
  /** Set to end rather than renew — cancelled, but paid up until renewsAt. */
  ending: boolean
  status: SubscriptionStatus
}

/** Live first (subscribed, then on trial), then lapsed; newest first within each. */
const ORDER: Record<string, number> = { active: 0, trialing: 1, cancelled: 2, expired: 3 }

/**
 * Who subscribes to an expert's sections, masked the way an affiliate's clients are:
 * "Sarah K.", "s•••@gmail.com". Enough for an expert to see their audience grow and
 * churn and to recognise a name they know; not a mailing list. No amounts per person —
 * what anyone paid stays in the totals.
 *
 * Section subscribers only. All-access members can read every expert, but they bought the
 * whole desk rather than this expert, and are counted, not listed.
 */
export async function expertSubscribers(authorId: string, limit = 500): Promise<ExpertSubscriber[]> {
  const rows = await db.entitlement.findMany({
    where: {
      section: { authorId },
      // Never paid nor started: a checkout somebody walked away from, not a subscriber.
      status: { in: ['active', 'trialing', 'cancelled', 'expired'] },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      status: true,
      startedAt: true,
      createdAt: true,
      renewsAt: true,
      cancelAtPeriodEnd: true,
      member: { select: { email: true, firstName: true, lastName: true, billingCountry: true } },
      section: { include: { topic: true, author: true } },
    },
  })

  return rows
    .map((row) => ({
      id: row.id,
      name: maskName(row.member.firstName, row.member.lastName, row.member.email),
      email: maskEmail(row.member.email),
      section: row.section ? sectionName(row.section) : '—',
      country: row.member.billingCountry,
      since: row.startedAt ?? row.createdAt,
      renewsAt: row.renewsAt,
      ending: row.cancelAtPeriodEnd,
      status: row.status,
    }))
    .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9) || b.since.getTime() - a.since.getTime())
}
