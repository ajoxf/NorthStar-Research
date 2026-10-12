import 'server-only'

import { db } from '@/lib/db'
import { appBaseUrl } from '@/lib/env'
import { getNotificationProvider } from '@/lib/notifications'
import {
  type PayoutDetailsFields,
  type PayoutDetailsInput,
  describePayoutDetails,
  validatePayoutDetails,
} from '@/lib/payout-details-shape'
import { AFFILIATE_PAGE, EXPERT_PAGE } from '@/lib/portal-account'

/**
 * Saved payout details for an expert or an affiliate: reading them, and changing them.
 *
 * Only ever reached through the signed-in member's own expert or affiliate record — the
 * routes look the party up from the session, never from the request body.
 */

export type Party = { authorId: string } | { affiliateId: string }

export async function payoutDetailsFor(party: Party): Promise<(PayoutDetailsFields & { updatedAt: Date }) | null> {
  const row = await db.payoutDetails.findUnique({
    where: 'authorId' in party ? { authorId: party.authorId } : { affiliateId: party.affiliateId },
    select: { method: true, holderName: true, account: true, routing: true, bankName: true, updatedAt: true },
  })
  return row
}

export type SaveResult = { ok: true; summary: string; alerted: boolean } | { ok: false; error: string; field?: string; status: number }

/**
 * Save the details, and tell the account owner that they changed.
 *
 * The email goes to the member who is signed in — the owner of the login — whether or not
 * they made the change themselves; if someone else is in their account, that is exactly
 * who needs to hear about it. A failed email does not undo the save, but is reported back.
 */
export async function savePayoutDetails(party: Party, input: PayoutDetailsInput, member: { id: string; email: string; firstName: string | null }): Promise<SaveResult> {
  const checked = validatePayoutDetails(input)
  if (!checked.ok) return { ok: false, error: checked.error, field: checked.field, status: 400 }

  const where = 'authorId' in party ? { authorId: party.authorId } : { affiliateId: party.affiliateId }
  const before = await db.payoutDetails.findUnique({ where, select: { method: true, account: true, routing: true, bankName: true, holderName: true } })
  const value = checked.value
  await db.payoutDetails.upsert({
    where,
    create: { ...party, ...value, updatedByMemberId: member.id },
    update: { ...value, updatedByMemberId: member.id },
  })

  const summary = describePayoutDetails(value)
  const unchanged =
    before &&
    before.method === value.method &&
    before.account === value.account &&
    before.routing === value.routing &&
    before.bankName === value.bankName &&
    before.holderName === value.holderName
  if (unchanged) return { ok: true, summary, alerted: false }

  let alerted = false
  try {
    const page = 'authorId' in party ? EXPERT_PAGE : `${AFFILIATE_PAGE}?tab=withdrawals`
    const result = await getNotificationProvider().sendPayoutDetailsChanged(
      { email: member.email, name: member.firstName },
      { now: summary, pageUrl: `${appBaseUrl()}${page}` },
    )
    alerted = result.status === 'sent'
    if (!alerted) console.error(`[payout-details] change alert to ${member.email} failed: ${result.error}`)
  } catch (error) {
    console.error('[payout-details] could not send the change alert', error)
  }
  return { ok: true, summary, alerted }
}
