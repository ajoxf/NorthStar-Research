import type {
  DeliveryResult,
  NotificationProvider,
  ReceiptDetails,
  Recipient,
  ReportSummary,
} from '@/lib/notifications/types'
import { receiptEmail, redemptionCodeEmail, reportEmail, welcomeEmail } from '@/lib/notifications/templates'

/**
 * Development / unconfigured fallback.
 *
 * Logs what *would* have been sent instead of calling a vendor. Used when
 * EMAIL_PROVIDER / WHATSAPP_PROVIDER are unset or set to `console`, so the whole
 * publish-and-deliver flow is exercisable end to end before any provider account exists.
 *
 * It reports `sent` so DeliveryLog rows are produced and the CRM engagement views have
 * data to render, but every log line is prefixed so nobody mistakes this for real delivery.
 */
export class ConsoleProvider implements NotificationProvider {
  readonly name = 'console'

  async sendReportEmail(
    recipient: Recipient,
    report: ReportSummary,
    reportUrl: string,
  ): Promise<DeliveryResult> {
    const { subject } = reportEmail(report, reportUrl, recipient.firstName)
    console.info(`[notifications:console] EMAIL → ${recipient.email} | ${subject} | ${reportUrl}`)
    return { status: 'sent', provider: this.name, providerMessageId: `console-${Date.now()}` }
  }

  async sendReportWhatsApp(
    recipient: Recipient,
    report: ReportSummary,
    reportUrl: string,
  ): Promise<DeliveryResult> {
    console.info(
      `[notifications:console] WHATSAPP → ${recipient.phoneNumber} | ${report.title} | ${reportUrl}`,
    )
    return { status: 'sent', provider: this.name, providerMessageId: `console-${Date.now()}` }
  }

  async sendRedemptionCodeEmail(
    recipient: { email: string; firstName?: string | null },
    code: string,
    redeemUrl: string,
  ): Promise<DeliveryResult> {
    const { subject } = redemptionCodeEmail(code, redeemUrl, recipient.firstName)
    console.info(
      `[notifications:console] EMAIL → ${recipient.email} | ${subject} | code=${code} | ${redeemUrl}`,
    )
    return { status: 'sent', provider: this.name, providerMessageId: `console-${Date.now()}` }
  }

  async sendRedemptionCodeWhatsApp(
    recipient: { phoneNumber: string },
    code: string,
    redeemUrl: string,
  ): Promise<DeliveryResult> {
    console.info(
      `[notifications:console] WHATSAPP → ${recipient.phoneNumber} | code=${code} | ${redeemUrl}`,
    )
    return { status: 'sent', provider: this.name, providerMessageId: `console-${Date.now()}` }
  }

  async sendWelcomeEmail(
    recipient: { email: string; firstName?: string | null },
    dashboardUrl: string,
  ): Promise<DeliveryResult> {
    const { subject } = welcomeEmail(dashboardUrl, recipient.firstName)
    console.info(`[notifications:console] EMAIL → ${recipient.email} | ${subject} | ${dashboardUrl}`)
    return { status: 'sent', provider: this.name, providerMessageId: `console-${Date.now()}` }
  }

  async sendReceiptEmail(
    recipient: { email: string; firstName?: string | null },
    details: ReceiptDetails,
  ): Promise<DeliveryResult> {
    const { subject } = receiptEmail(details, recipient.firstName)
    console.info(
      `[notifications:console] EMAIL → ${recipient.email} | ${subject} | ref=${details.reference}`,
    )
    return { status: 'sent', provider: this.name, providerMessageId: `console-${Date.now()}` }
  }

  async sendMagicLink(
    recipient: { email: string; firstName?: string | null },
    link: string,
    expiresInMinutes: number,
  ): Promise<DeliveryResult> {
    // Printed in full so magic-link sign-in is testable locally with no email provider:
    // copy the URL out of the server log and paste it into the browser.
    console.info(
      `[notifications:console] MAGIC LINK → ${recipient.email} | expires in ${expiresInMinutes}m | ${link}`,
    )
    return { status: 'sent', provider: this.name, providerMessageId: `console-${Date.now()}` }
  }

  async sendSampleReportRequest(request: {
    name: string
    email: string
    note?: string
  }): Promise<DeliveryResult> {
    console.info(
      `[notifications:console] SAMPLE REQUEST → desk | ${request.name} <${request.email}>` +
        (request.note ? ` | ${request.note}` : ''),
    )
    return { status: 'sent', provider: this.name, providerMessageId: `console-${Date.now()}` }
  }

  async sendCodeExpiring(
    recipient: { email: string; firstName?: string | null },
    code: string,
    redeemUrl: string,
    daysRemaining: number,
  ): Promise<DeliveryResult> {
    console.info(
      `[notifications:console] CODE EXPIRING → ${recipient.email} | ${code} | ${daysRemaining}d left | ${redeemUrl}`,
    )
    return { status: 'sent', provider: this.name, providerMessageId: `console-${Date.now()}` }
  }

  async sendRenewalReminder(
    recipient: { email: string; firstName?: string | null },
    daysRemaining: number,
    renewUrl: string,
  ): Promise<DeliveryResult> {
    console.info(
      `[notifications:console] RENEWAL → ${recipient.email} | ${daysRemaining}d left | ${renewUrl}`,
    )
    return { status: 'sent', provider: this.name, providerMessageId: `console-${Date.now()}` }
  }

  async sendPricingInvite(
    recipient: { email: string; name?: string | null },
    invite: { price: string; interval: string; joinUrl: string },
  ): Promise<DeliveryResult> {
    console.info(
      `[notifications:console] PRICING → ${recipient.email} | ${invite.price} per ${invite.interval} | ${invite.joinUrl}`,
    )
    return { status: 'sent', provider: this.name, providerMessageId: `console-${Date.now()}` }
  }
}
