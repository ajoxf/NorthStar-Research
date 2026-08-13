import type { Member, Report } from '@prisma/client'

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
}
