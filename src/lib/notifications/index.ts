import { optionalEnv } from '@/lib/env'
import { ConsoleProvider } from '@/lib/notifications/console-provider'
import { ResendProvider } from '@/lib/notifications/resend-provider'
import { TwilioWhatsAppProvider } from '@/lib/notifications/twilio-provider'
import type {
  DeliveryResult,
  NotificationProvider,
  Recipient,
  ReportSummary,
} from '@/lib/notifications/types'

export type { DeliveryResult, NotificationProvider, Recipient, ReportSummary }

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
}

export function getNotificationProvider(): NotificationProvider {
  return new CompositeProvider()
}

export function providerNames(): { email: string; whatsapp: string } {
  return { email: emailProvider().name, whatsapp: whatsappProvider().name }
}
