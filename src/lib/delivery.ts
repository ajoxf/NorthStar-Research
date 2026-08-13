import 'server-only'

import type { Report } from '@prisma/client'

import { db } from '@/lib/db'
import { appBaseUrl } from '@/lib/env'
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
 * The link put in every email and WhatsApp message.
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
  byChannel: { email: number; whatsapp: number }
}

/**
 * Deliver a report to every active member, one DeliveryLog row per member per channel.
 *
 * Idempotent by design: the `[memberId, reportId, channel]` unique constraint means
 * re-running a send (cron retry, admin re-publish) will not spam a member twice.
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
      phoneNumber: true,
      whatsappOptIn: true,
      whatsappVerified: true,
    },
  })

  const summary: DeliverySummary = {
    reportId: report.id,
    attempted: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    byChannel: { email: 0, whatsapp: 0 },
  }

  const reportSummary = {
    id: report.id,
    type: report.type,
    title: report.title,
    summary: report.summary,
    publishDate: report.publishDate,
  }

  for (const member of members) {
    const channels: ('email' | 'whatsapp')[] = ['email']
    // WhatsApp requires an explicit opt-in AND a verified number — an unverified
    // opt-in is surfaced in the UI as a pending state rather than silently messaged.
    if (member.whatsappOptIn && member.whatsappVerified && member.phoneNumber) {
      channels.push('whatsapp')
    }

    for (const channel of channels) {
      const existing = await db.deliveryLog.findUnique({
        where: {
          memberId_reportId_channel: { memberId: member.id, reportId: report.id, channel },
        },
      })
      if (existing && existing.status !== 'failed') {
        summary.skipped += 1
        continue
      }

      summary.attempted += 1
      const result =
        channel === 'email'
          ? await provider.sendReportEmail(member as Recipient, reportSummary, url)
          : await provider.sendReportWhatsApp(member as Recipient, reportSummary, url)

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
