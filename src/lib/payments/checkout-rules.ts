import type { PaymentCapabilities } from '@/lib/payments/types'

/**
 * The rules checkout applies before any rail is called. Pure, so they are tested directly
 * (checkout-rules.test.ts); checkout.ts reads the database and then asks these.
 */

/**
 * Should a package checkout be refused because this email already has a live membership?
 *
 * Only on a recurring rail. A second card subscription for somebody already subscribed
 * would bill them twice, every period, until somebody noticed. A one-off crypto payment is
 * how a crypto member renews — it stacks another period on the time they have left — so
 * refusing it would lock them out of the only way they can pay.
 */
export function refuseExistingMembership(
  capabilities: Pick<PaymentCapabilities, 'recurring'>,
  member: { hasPassword: boolean; subscriptionStatus: string | null } | null,
): boolean {
  if (!capabilities.recurring || member === null) return false
  return member.hasPassword && member.subscriptionStatus === 'active'
}

/**
 * Does this member already hold the section? A live entitlement that has not run out.
 * Refused on every rail: buying a section you are reading is a mistake, not a renewal.
 */
export function alreadyHoldsSection(
  held: { status: string; renewsAt: Date | null } | null,
  now: Date = new Date(),
): boolean {
  if (!held || held.status !== 'active') return false
  return held.renewsAt === null || held.renewsAt.getTime() > now.getTime()
}
