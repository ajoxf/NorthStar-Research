import { NextResponse } from 'next/server'

import { daysUntilExpiry, expiringSoonWhere } from '@/lib/code-expiry'
import { db } from '@/lib/db'
import { appBaseUrl, isPlaceholder } from '@/lib/env'
import { getNotificationProvider } from '@/lib/notifications'
import { productAuthConfigured, syncProductAccess } from '@/lib/product-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Daily subscription housekeeping.
 *
 *   1. Remind crypto members whose period ends soon — they must pay manually, so a
 *      silent lapse would be our fault, not theirs. Card members are skipped: Stripe
 *      renews them and dunning is its job.
 *   2. Warn the holders of unredeemed access codes that are about to lapse. A different
 *      failure from the above: these people have paid and not yet started, so nothing is
 *      lost that the desk cannot restore — but they would find out by typing a dead code
 *      rather than by being told.
 *   3. Mark lapsed members `expired`.
 *   4. Close the door on product entitlements that have ended, and reconcile any that
 *      should be open and are not. This is the only place that notices a trial running
 *      out: nothing else happens on the day it does.
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
  const redeemUrl = `${appBaseUrl()}/redeem`

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

  // 2. Warn the holders of unredeemed codes that are about to lapse.
  //
  // Separate from the membership reminder above because it is a different failure: these
  // people have paid and have *not yet started*. Their code dying costs them nothing they
  // cannot get back — the desk can extend it — but they would find out by typing a dead
  // code, days after the moment they were willing to act.
  const expiringCodes = await db.redemptionCode.findMany({
    // Shared with the admin console's count, so the figure on screen is the set this
    // loop actually walks.
    where: expiringSoonWhere(now),
    select: { id: true, code: true, email: true, expiresAt: true },
  })

  let codeWarningsSent = 0
  let codeWarningsUnreachable = 0
  for (const entry of expiringCodes) {
    // Gifted codes carry an operator's note where an address would be. Counted, not
    // silently dropped: they are the codes most likely to be forgotten, and the admin
    // console shows the same figure so this group never becomes invisible.
    if (!entry.email || !entry.expiresAt) {
      codeWarningsUnreachable += 1
      continue
    }

    try {
      const result = await provider.sendCodeExpiring(
        { email: entry.email },
        entry.code,
        redeemUrl,
        daysUntilExpiry(entry.expiresAt, now),
      )
      if (result.status === 'sent') {
        await db.redemptionCode.update({
          where: { id: entry.id },
          data: { expiryReminderSentAt: now },
        })
        codeWarningsSent += 1
      } else {
        // Deliberately not stamped: a send that failed has not warned anybody, and
        // marking it would mean this code is never tried again.
        console.error(`[cron:subscriptions] code warning to ${entry.email} failed: ${result.error}`)
      }
    } catch (error) {
      console.error(`[cron:subscriptions] code warning to ${entry.email} threw`, error)
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

  /*
   * Product accounts, brought into line with what people actually hold.
   *
   * Two groups, and the second is the reason this is a reconciliation rather than a
   * revocation pass: everyone whose product entitlement has ended and still has a live
   * account there, and everyone holding a live entitlement whose account there is
   * disabled — a renewal, or a grant made while the product's auth system was
   * unreachable. `syncProductAccess` decides which is which; this only has to find them.
   */
  let accessChanged = 0
  if (productAuthConfigured()) {
    /*
     * Every linked account, asked the same question: does this member still hold this
     * product? `syncProductAccess` reads the entitlement and the account and acts on the
     * difference, so a row that is already right costs two queries and no outbound call.
     *
     * Deliberately not a clever query. Matching each account against its own item's
     * entitlement is not something a relation filter can say without comparing a row to
     * itself, and the version that nearly says it — "holds any live item" — would close
     * the door on somebody who holds two products and has let one lapse.
     */
    const accounts = await db.productAccount.findMany({
      select: { memberId: true, item: { select: { slug: true } } },
      orderBy: { updatedAt: 'asc' },
      take: 1000,
    })

    for (const account of accounts) {
      const outcome = await syncProductAccess(account.memberId, { itemSlug: account.item.slug })
      if (outcome.action === 'disable' || outcome.action === 'reactivate') accessChanged += 1
    }
  }

  console.info(
    `[cron:subscriptions] ${remindersSent} reminders sent, ${codeWarningsSent} code warnings sent ` +
      `(${codeWarningsUnreachable} had no address), ${expired.count} memberships expired, ` +
      `${accessChanged} product accounts opened or closed`,
  )

  return NextResponse.json({
    ok: true,
    remindersSent,
    codeWarningsSent,
    codeWarningsUnreachable,
    expired: expired.count,
    accessChanged,
  })
}
