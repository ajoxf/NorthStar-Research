import twilio from 'twilio'

import { isPlaceholder, requireEnvAll } from '@/lib/env'
import type {
  DeliveryResult,
  NotificationProvider,
  Recipient,
  ReportSummary,
} from '@/lib/notifications/types'
import { reportTypeLabel } from '@/lib/report-content'

/**
 * WhatsApp delivery via Twilio's WhatsApp Business API.
 *
 * Two constraints the client needs to understand, because they are not code problems:
 *   1. This requires a WhatsApp Business API sender verified through Twilio — a
 *      personal WhatsApp number cannot be used and there is no way to fake it.
 *   2. Business-initiated messages must use a pre-approved template. Free-form text is
 *      only permitted inside a 24-hour window opened by the member messaging first.
 *      `TWILIO_WHATSAPP_TEMPLATE_SID` is that approved template; when it is set we send
 *      via `contentSid` + variables, which is the correct path for a weekly report drop.
 *
 * As everywhere else, the message carries a portal link only — never report content.
 */
export class TwilioWhatsAppProvider implements NotificationProvider {
  readonly name = 'twilio'

  private config() {
    return requireEnvAll(
      ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_FROM'],
      'WhatsApp delivery (Twilio)',
    )
  }

  private async send(to: string, body: string, variables: Record<string, string>): Promise<DeliveryResult> {
    try {
      const env = this.config()
      const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
      const templateSid = process.env.TWILIO_WHATSAPP_TEMPLATE_SID

      const payload: Record<string, unknown> = {
        from: env.TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')
          ? env.TWILIO_WHATSAPP_FROM
          : `whatsapp:${env.TWILIO_WHATSAPP_FROM}`,
        to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
      }

      if (!isPlaceholder(templateSid)) {
        payload.contentSid = templateSid
        payload.contentVariables = JSON.stringify(variables)
      } else {
        // Only reaches WhatsApp inside an open 24h session window. Fine for testing
        // with the Twilio sandbox; a template is required for production sends.
        payload.body = body
      }

      const message = await client.messages.create(payload as never)
      return { status: 'sent', provider: this.name, providerMessageId: message.sid }
    } catch (error) {
      return {
        status: 'failed',
        provider: this.name,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async sendReportWhatsApp(
    recipient: Recipient,
    report: ReportSummary,
    reportUrl: string,
  ): Promise<DeliveryResult> {
    if (!recipient.phoneNumber) {
      return { status: 'failed', provider: this.name, error: 'Member has no phone number on file.' }
    }
    const label = reportTypeLabel(report.type)
    return this.send(
      recipient.phoneNumber,
      `NordStar Pro — ${label ? `${label}: ` : ''}${report.title}. Read it in your member portal (sign-in required): ${reportUrl}`,
      { 1: label ?? 'Research', 2: report.title, 3: reportUrl },
    )
  }

  async sendRedemptionCodeWhatsApp(
    recipient: { phoneNumber: string },
    code: string,
    redeemUrl: string,
  ): Promise<DeliveryResult> {
    return this.send(
      recipient.phoneNumber,
      `NordStar Pro — your access code is ${code}. Activate your membership: ${redeemUrl}`,
      { 1: code, 2: redeemUrl },
    )
  }

  async sendReportEmail(): Promise<DeliveryResult> {
    return { status: 'failed', provider: this.name, error: 'Twilio provider does not send email.' }
  }

  async sendRedemptionCodeEmail(): Promise<DeliveryResult> {
    return { status: 'failed', provider: this.name, error: 'Twilio provider does not send email.' }
  }

  async sendMagicLink(): Promise<DeliveryResult> {
    return { status: 'failed', provider: this.name, error: 'Twilio provider does not send email.' }
  }

  async sendSampleReportRequest(): Promise<DeliveryResult> {
    return { status: 'failed', provider: this.name, error: 'Twilio provider does not send email.' }
  }

  async sendWelcomeEmail(): Promise<DeliveryResult> {
    return { status: 'failed', provider: this.name, error: 'Twilio provider does not send email.' }
  }

  async sendReceiptEmail(): Promise<DeliveryResult> {
    return { status: 'failed', provider: this.name, error: 'Twilio provider does not send email.' }
  }

  async sendRenewalReminder(): Promise<DeliveryResult> {
    return { status: 'failed', provider: this.name, error: 'Twilio provider does not send email.' }
  }

  async sendPricingInvite(): Promise<DeliveryResult> {
    return { status: 'failed', provider: this.name, error: 'Twilio provider does not send email.' }
  }
}
