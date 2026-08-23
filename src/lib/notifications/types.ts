import type { Member, Report } from '@prisma/client'

import type { LatestReport, ReceiptDetails } from '@/lib/notifications/templates'

export type { LatestReport, ReceiptDetails }

/**
 * The delivery seam.
 *
 * Everything that sends a message to a member goes through this interface. Nothing
 * outside `src/lib/notifications/` imports Resend, Twilio, or any other vendor SDK —
 * checkout, redemption, publishing and the weekly cron all call the interface.
 *
 * Migrating to Kit.com (or Postmark, or SendGrid, or Meta's WhatsApp Cloud API) means
 * writing one new file that implements `NotificationProvider` and registering it in
 * `index.ts`. No changes to payment, redemption, or report logic. See README §Portability.
 */

export type DeliveryResult = {
  status: 'sent' | 'failed'
  providerMessageId?: string
  provider: string
  error?: string
}

/** A member as far as delivery is concerned — kept narrow so any provider can satisfy it. */
export type Recipient = Pick<
  Member,
  'id' | 'email' | 'firstName' | 'lastName' | 'phoneNumber' | 'whatsappOptIn' | 'whatsappVerified'
>

export type ReportSummary = Pick<Report, 'id' | 'type' | 'title' | 'summary' | 'publishDate'>

/** A sample-report enquiry from the public site. Not a member, not a subscriber. */
export type SampleReportRequest = {
  name: string
  email: string
  note?: string
}

export interface NotificationProvider {
  readonly name: string

  /**
   * Notify a member that a report is available.
   *
   * Implementations MUST link into the authenticated portal and MUST NOT embed report
   * content or any link that renders without a live member session (build spec §5.5).
   * The `reportUrl` handed to implementations is already a portal route, not a payload URL.
   */
  sendReportEmail(recipient: Recipient, report: ReportSummary, reportUrl: string): Promise<DeliveryResult>

  sendReportWhatsApp(
    recipient: Recipient,
    report: ReportSummary,
    reportUrl: string,
  ): Promise<DeliveryResult>

  /** Transactional: deliver a redemption code after a verified payment. */
  sendRedemptionCodeEmail(
    recipient: { email: string; firstName?: string | null },
    code: string,
    redeemUrl: string,
  ): Promise<DeliveryResult>

  sendRedemptionCodeWhatsApp(
    recipient: { phoneNumber: string },
    code: string,
    redeemUrl: string,
  ): Promise<DeliveryResult>

  /** Transactional: a passwordless sign-in link. */
  sendMagicLink(
    recipient: { email: string; firstName?: string | null },
    link: string,
    expiresInMinutes: number,
  ): Promise<DeliveryResult>

  /**
   * Internal: tell the desk that a visitor asked for a sample report.
   *
   * Goes to US, never to the visitor. An unauthenticated endpoint must not be able to
   * cause research to be delivered to an arbitrary address (build spec §5.5).
   */
  sendSampleReportRequest(request: SampleReportRequest): Promise<DeliveryResult>
  /** Pricing, sent to one person who asked for it. See PricingEnquiry. */
  sendPricingInvite(
    recipient: { email: string; name?: string | null },
    invite: { price: string; interval: string; joinUrl: string; message?: string | null },
  ): Promise<DeliveryResult>

  /**
   * Transactional: welcome a member whose membership has just become active.
   *
   * Called once, at redemption — the single point every route converges on, so a member
   * who arrived on a gifted or referral code is welcomed exactly like one who paid.
   */
  sendWelcomeEmail(
    recipient: { email: string; firstName?: string | null },
    dashboardUrl: string,
    /** The newest published edition, so a new member has something to open at once. */
    latest?: LatestReport | null,
  ): Promise<DeliveryResult>

  /**
   * Transactional: a receipt for a payment that actually happened.
   *
   * Called from the payment webhooks, which is the only place the amount and the
   * processor's reference are known. Free and gifted memberships have no payment and
   * therefore get no receipt.
   */
  sendReceiptEmail(
    recipient: { email: string; firstName?: string | null },
    details: ReceiptDetails,
  ): Promise<DeliveryResult>

  /** Transactional: warn a crypto member that their period is about to lapse. */
  sendRenewalReminder(
    recipient: { email: string; firstName?: string | null },
    daysRemaining: number,
    renewUrl: string,
  ): Promise<DeliveryResult>
}
