import { appBaseUrl } from '@/lib/env'
import {
  magicLinkEmail,
  receiptEmail,
  redemptionCodeEmail,
  renewalReminderEmail,
  reportEmail,
  sampleReportRequestEmail,
  welcomeEmail,
} from '@/lib/notifications/templates'

/**
 * Every email the product sends, rendered with sample data.
 *
 * This exists so copy can be read before a member reads it. The templates are pure
 * functions of their arguments, so calling them here produces byte-identical markup to
 * what the provider is handed at send time — this is the real email, not a mock-up of one.
 *
 * **Nothing here sends anything.** There is no provider, no API key and no recipient in
 * this file, and the admin page that renders it has no send button. A preview that could
 * post mail to a real address is one misplaced click away from mailing the membership.
 *
 * The sample values are conspicuously fake — `SAMPLE-...` references, `sample@` addresses
 * — so a screenshot of this page can never be mistaken for a real member's record.
 *
 * When you add a template, add it here in the same commit. The list is what makes an
 * email reviewable, and one that is missing from it is one nobody proofreads.
 */

export type EmailPreview = {
  /** URL-safe identifier, stable across renders — used as the anchor and React key. */
  key: string
  name: string
  /** When this fires, in plain language. */
  trigger: string
  /** Who receives it. Members see six of these; the desk sees one. */
  audience: 'member' | 'desk'
  subject: string
  html: string
  text: string
}

/**
 * A fixed date, not `new Date()`.
 *
 * Preview output must not change between two loads of the same page, or a "what changed?"
 * comparison becomes impossible to read.
 */
const SAMPLE_DATE = new Date('2026-03-17T09:30:00Z')

export function emailPreviews(): EmailPreview[] {
  const base = appBaseUrl()

  const rendered: Array<Omit<EmailPreview, 'subject' | 'html' | 'text'> & {
    render: () => { subject: string; html: string; text: string }
  }> = [
    {
      key: 'welcome',
      name: 'Welcome',
      trigger: 'Once, when a membership becomes active — card, crypto, gifted or referral code.',
      audience: 'member',
      render: () => welcomeEmail(`${base}/dashboard`, 'Sam'),
    },
    {
      key: 'receipt',
      name: 'Receipt',
      trigger: 'On a payment that actually happened. Gifted and referral members get none.',
      audience: 'member',
      render: () =>
        receiptEmail({
          amount: '199.00',
          currency: 'USD',
          method: 'Card',
          reference: 'SAMPLE-REFERENCE-0000',
          paidAt: SAMPLE_DATE,
        }),
    },
    {
      key: 'access-code',
      name: 'Access code',
      trigger: 'After a verified payment, carrying the code that activates the account.',
      audience: 'member',
      render: () =>
        redemptionCodeEmail('SAMPLE-CODE-0000', `${base}/redeem?code=SAMPLE-CODE-0000`),
    },
    {
      key: 'report',
      name: 'Report published',
      trigger: 'To every active member when a report is published.',
      audience: 'member',
      render: () =>
        reportEmail(
          {
            id: 'sample',
            type: 'commodities',
            title: 'Sample edition — this is what a published report looks like',
            summary:
              'A one-line summary sits here. The research itself never travels in the email; the button opens it inside the portal.',
            publishDate: SAMPLE_DATE,
          },
          `${base}/reports/sample`,
          'Sam',
        ),
    },
    {
      key: 'magic-link',
      name: 'Sign-in link',
      trigger: 'When somebody asks for an email link instead of a password.',
      audience: 'member',
      render: () => magicLinkEmail(`${base}/api/auth/magic?token=SAMPLE`, 15, 'Sam'),
    },
    {
      key: 'renewal',
      name: 'Renewal reminder',
      trigger: 'To crypto members before their period lapses. Card members renew automatically.',
      audience: 'member',
      render: () => renewalReminderEmail(3, `${base}/checkout`, 'Sam'),
    },
    {
      key: 'sample-request',
      name: 'Sample report enquiry',
      trigger: 'When a visitor asks for a sample. Goes to the desk — never to the enquirer.',
      audience: 'desk',
      render: () =>
        sampleReportRequestEmail({
          name: 'Sample Enquirer',
          email: 'sample@example.com',
          note: 'Whatever the visitor typed in the note field appears here.',
        }),
    },
  ]

  return rendered.map(({ render, ...meta }) => ({ ...meta, ...render() }))
}
