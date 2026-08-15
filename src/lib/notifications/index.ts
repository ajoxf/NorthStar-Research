import { optionalEnv } from '@/lib/env'
import { ConsoleProvider } from '@/lib/notifications/console-provider'
import { ResendProvider } from '@/lib/notifications/resend-provider'
import { TwilioWhatsAppProvider } from '@/lib/notifications/twilio-provider'
import type {
  DeliveryResult,
  NotificationProvider,
  ReceiptDetails,
  Recipient,
  ReportSummary,
} from '@/lib/notifications/types'

export type { DeliveryResult, NotificationProvider, ReceiptDetails, Recipient, ReportSummary }

/**
 * Provider registry — the single place a delivery vendor is named.
 *
 * To move delivery to Kit.com: write `kit-provider.ts` implementing
 * `NotificationProvider`, add one `case 'kit':` below, and set EMAIL_PROVIDER=kit.
 * Nothing in checkout, redemption, publishing or the weekly cron changes.
 */
function emailProvider(): NotificationProvider {
  switch (optionalEnv('EMAIL_PROVIDER', 'console').toLowerCase()) {
    case 'resend':
      return new ResendProvider()
    // case 'kit':      return new KitProvider()
    // case 'postmark': return new PostmarkProvider()
    default:
      return new ConsoleProvider()
  }
}

function whatsappProvider(): NotificationProvider {
  switch (optionalEnv('WHATSAPP_PROVIDER', 'console').toLowerCase()) {
    case 'twilio':
      return new TwilioWhatsAppProvider()
    // case 'meta': return new MetaCloudProvider()
    default:
      return new ConsoleProvider()
  }
}

/**
 * Presents the email provider and the WhatsApp provider as one `NotificationProvider`,
 * so callers never have to know that two different vendors are involved.
 */
class CompositeProvider implements NotificationProvider {
  private readonly email = emailProvider()
  private readonly whatsapp = whatsappProvider()

  get name(): string {
    return `${this.email.name}+${this.whatsapp.name}`
  }

  sendReportEmail(recipient: Recipient, report: ReportSummary, url: string) {
    return this.email.sendReportEmail(recipient, report, url)
  }

  sendReportWhatsApp(recipient: Recipient, report: ReportSummary, url: string) {
    return this.whatsapp.sendReportWhatsApp(recipient, report, url)
  }

  sendRedemptionCodeEmail(
    recipient: { email: string; firstName?: string | null },
    code: string,
    url: string,
  ) {
    return this.email.sendRedemptionCodeEmail(recipient, code, url)
  }

  sendRedemptionCodeWhatsApp(recipient: { phoneNumber: string }, code: string, url: string) {
    return this.whatsapp.sendRedemptionCodeWhatsApp(recipient, code, url)
  }

  sendMagicLink(
    recipient: { email: string; firstName?: string | null },
    link: string,
    expiresInMinutes: number,
  ) {
    return this.email.sendMagicLink(recipient, link, expiresInMinutes)
  }

  sendSampleReportRequest(request: { name: string; email: string; note?: string }) {
    return this.email.sendSampleReportRequest(request)
  }

  sendWelcomeEmail(recipient: { email: string; firstName?: string | null }, dashboardUrl: string) {
    return this.email.sendWelcomeEmail(recipient, dashboardUrl)
  }

  sendReceiptEmail(
    recipient: { email: string; firstName?: string | null },
    details: ReceiptDetails,
  ) {
    return this.email.sendReceiptEmail(recipient, details)
  }

  sendRenewalReminder(
    recipient: { email: string; firstName?: string | null },
    daysRemaining: number,
    renewUrl: string,
  ) {
    return this.email.sendRenewalReminder(recipient, daysRemaining, renewUrl)
  }
}

export function getNotificationProvider(): NotificationProvider {
  return new CompositeProvider()
}

/**
 * Names of the providers actually in use, for the admin console's status panel.
 *
 * WhatsApp is descoped as a delivery channel, so it is not reported here — but the
 * provider plumbing below is left intact rather than deleted, so re-enabling it is a
 * change in src/lib/delivery.ts and nowhere else.
 */
export function providerNames(): { email: string } {
  return { email: emailProvider().name }
}
