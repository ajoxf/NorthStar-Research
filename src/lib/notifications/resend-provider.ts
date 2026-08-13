import { Resend } from 'resend'

import { optionalEnv, requireEnv } from '@/lib/env'
import { redemptionCodeEmail, reportEmail } from '@/lib/notifications/templates'
import type {
  DeliveryResult,
  NotificationProvider,
  Recipient,
  ReportSummary,
} from '@/lib/notifications/types'

/**
 * Email delivery via Resend.
 *
 * WhatsApp methods intentionally fail here — email and WhatsApp are composed together
 * in `index.ts` rather than one provider pretending to do both.
 */
export class ResendProvider implements NotificationProvider {
  readonly name = 'resend'

  private client(): Resend {
    return new Resend(requireEnv('RESEND_API_KEY', 'Email delivery (Resend)'))
  }

  private from(): string {
    return optionalEnv('EMAIL_FROM', 'NorthStar Research <onboarding@resend.dev>')
  }

  private async send(to: string, subject: string, html: string, text: string): Promise<DeliveryResult> {
    try {
      const { data, error } = await this.client().emails.send({
        from: this.from(),
        to,
        subject,
        html,
        text,
      })

      if (error) {
        return { status: 'failed', provider: this.name, error: error.message }
      }
      return { status: 'sent', provider: this.name, providerMessageId: data?.id }
    } catch (error) {
      return {
        status: 'failed',
        provider: this.name,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async sendReportEmail(
    recipient: Recipient,
    report: ReportSummary,
    reportUrl: string,
  ): Promise<DeliveryResult> {
    const { subject, html, text } = reportEmail(report, reportUrl, recipient.firstName)
    return this.send(recipient.email, subject, html, text)
  }

  async sendRedemptionCodeEmail(
    recipient: { email: string; firstName?: string | null },
    code: string,
    redeemUrl: string,
  ): Promise<DeliveryResult> {
    const { subject, html, text } = redemptionCodeEmail(code, redeemUrl, recipient.firstName)
    return this.send(recipient.email, subject, html, text)
  }

  async sendReportWhatsApp(): Promise<DeliveryResult> {
    return { status: 'failed', provider: this.name, error: 'Resend does not send WhatsApp messages.' }
  }

  async sendRedemptionCodeWhatsApp(): Promise<DeliveryResult> {
    return { status: 'failed', provider: this.name, error: 'Resend does not send WhatsApp messages.' }
  }
}
