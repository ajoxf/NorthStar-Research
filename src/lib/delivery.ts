import 'server-only'

import type { Report } from '@prisma/client'

import { db } from '@/lib/db'
import { appBaseUrl } from '@/lib/env'
import { wasReallyDelivered } from '@/lib/delivery-retry'
import { getNotificationProvider } from '@/lib/notifications'
import type { Recipient } from '@/lib/notifications/types'

/**
 * Report delivery orchestration.
 *
 * This is the only place that decides *who* gets a report and records the outcome.
 * It talks to the `NotificationProvider` interface and never to a vendor SDK, so
 * swapping delivery vendors does not touch this file either (build spec §9).
 */

/**
 * The link put in every notification email.
 *
 * Note this is a plain portal route, not a payload URL and not a pre-signed link.
 * Opening it requires a live member session; the short-lived signed URL that actually
 * fetches report bytes is minted *after* that session check, inside the reader. That is
 * what makes a forwarded link worthless (build spec §5.5 / §7).
 */
export function reportPortalUrl(reportId: string): string {
  return `${appBaseUrl()}/reports/${reportId}`
}

export type DeliverySummary = {
  reportId: string
  attempted: number
  sent: number
  failed: number
  skipped: number
  byChannel: { email: number }
}

/**
 * Deliver a report to every active member, one DeliveryLog row per member per channel.
 *
 * Email is the only delivery channel. WhatsApp was descoped: the DeliveryLog `channel`
 * column, the member opt-in columns and the provider's WhatsApp methods are all left in
 * place rather than dropped, so historic sends stay readable and turning the channel
 * back on is a small change here — but nothing in the product offers or promises it.
 *
 * Idempotent by design: the `[memberId, reportId, channel]` unique constraint means
 * re-running a send (cron retry, admin re-publish) will not spam a member twice.
 *
 * With one deliberate exception — a row recorded by a placeholder provider is retried,
 * because it never reached anybody. See src/lib/delivery-retry.ts: treating those as
 * delivered silently suppressed every real send to members who had been "delivered" to
 * while the console provider was active.
 */
export async function deliverReportToActiveMembers(report: Report): Promise<DeliverySummary> {
  const provider = getNotificationProvider()
  const url = reportPortalUrl(report.id)

  const members = await db.member.findMany({
    where: { subscriptionStatus: 'active' },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
    },
  })

  const summary: DeliverySummary = {
    reportId: report.id,
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    byChannel: { email: 0 },
  }

  const reportSummary = {
    id: report.id,
    type: report.type,
    title: report.title,
    summary: report.summary,
    publishDate: report.publishDate,
  }

  for (const member of members) {
    for (const channel of ['email'] as const) {
      const existing = await db.deliveryLog.findUnique({
        where: {
          memberId_reportId_channel: { memberId: member.id, reportId: report.id, channel },
        },
      })
      if (existing && existing.status !== 'failed' && wasReallyDelivered(existing.provider)) {
        summary.skipped += 1
        continue
      }

      summary.attempted += 1
      const result = await provider.sendReportEmail(member as Recipient, reportSummary, url)

      const data = {
        memberId: member.id,
        reportId: report.id,
        channel,
        status: result.status,
        provider: result.provider,
        providerMessageId: result.providerMessageId ?? null,
        error: result.error ?? null,
        sentAt: new Date(),
      }

      await db.deliveryLog.upsert({
        where: {
          memberId_reportId_channel: { memberId: member.id, reportId: report.id, channel },
        },
        create: data,
        update: data,
      })

      if (result.status === 'sent') {
        summary.sent += 1
        summary.byChannel[channel] += 1
      } else {
        summary.failed += 1
        console.error(
          `[delivery] ${channel} to ${member.email} failed for report ${report.id}: ${result.error}`,
        )
      }
    }
  }

  return summary
}
