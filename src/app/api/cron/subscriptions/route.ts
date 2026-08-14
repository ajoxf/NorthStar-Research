import { NextResponse } from 'next/server'

import { db } from '@/lib/db'
import { appBaseUrl, isPlaceholder } from '@/lib/env'
import { getNotificationProvider } from '@/lib/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Daily subscription housekeeping.
 *
 *   1. Remind crypto members whose period ends soon — they must pay manually, so a
 *      silent lapse would be our fault, not theirs. Card members are skipped: Stripe
 *      renews them and dunning is its job.
 *   2. Mark lapsed members `expired`.
 *
 * Access control does not depend on this job running: `hasActiveSubscription` checks the
 * renewal date directly, so a member is locked out the moment their period ends even if
 * this has not run yet. The job keeps the CRM view honest and sends the reminders.
 */

const REMINDER_DAYS_BEFORE = 3

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  if (isPlaceholder(secret)) {
    console.error('[cron:subscriptions] CRON_SECRET is not configured — refusing to run.')
    return NextResponse.json({ error: 'cron secret not configured' }, { status: 503 })
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const reminderCutoff = new Date(now.getTime() + REMINDER_DAYS_BEFORE * 24 * 60 * 60 * 1000)
  const provider = getNotificationProvider()
  const renewUrl = `${appBaseUrl()}/join`

  const dueForReminder = await db.member.findMany({
    where: {
      subscriptionStatus: 'active',
      billingProvider: 'cregis',
      subscriptionRenewsAt: { gt: now, lte: reminderCutoff },
      // Cleared whenever a payment extends the period, so each period reminds once.
      renewalReminderSentAt: null,
    },
    select: { id: true, email: true, firstName: true, subscriptionRenewsAt: true },
  })

  let remindersSent = 0
  for (const member of dueForReminder) {
    const daysRemaining = Math.max(
      0,
      Math.ceil(((member.subscriptionRenewsAt?.getTime() ?? 0) - now.getTime()) / 86_400_000),
    )

    try {
      const result = await provider.sendRenewalReminder(
        { email: member.email, firstName: member.firstName },
        daysRemaining,
        renewUrl,
      )
      if (result.status === 'sent') {
        await db.member.update({
          where: { id: member.id },
          data: { renewalReminderSentAt: now },
        })
        remindersSent += 1
      } else {
        console.error(`[cron:subscriptions] reminder to ${member.email} failed: ${result.error}`)
      }
    } catch (error) {
      console.error(`[cron:subscriptions] reminder to ${member.email} threw`, error)
    }
  }

  const expired = await db.member.updateMany({
    where: {
      subscriptionStatus: 'active',
      role: 'member',
      subscriptionRenewsAt: { lt: now },
    },
    data: { subscriptionStatus: 'expired' },
  })

  console.info(
    `[cron:subscriptions] ${remindersSent} reminders sent, ${expired.count} memberships expired`,
  )

  return NextResponse.json({ ok: true, remindersSent, expired: expired.count })
}
