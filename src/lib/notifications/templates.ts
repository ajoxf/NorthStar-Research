
import type { ReportSummary } from '@/lib/notifications/types'
import { CODE_VALIDITY_DAYS } from '@/lib/codes'

/**
 * Email markup.
 *
 * Table-based and inline-styled on purpose: this has to survive Outlook and Gmail,
 * which is why it does not share the Tailwind component set used in the app.
 *
 * Note what is deliberately absent: report content. The email carries a headline, a
 * one-line summary and a button into the portal — never the research itself, and never
 * a link that renders without a session (build spec §5.5).
 */

const BG = '#000000'
const PANEL = '#0B0B0B'
const LINE = '#1F1F1F'
const INK = '#FFFFFF'
const INK_DIM = '#A3A3A3'
const ACCENT = '#D0F53C'

function shell(title: string, body: string, footerNote?: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};color:${INK};font-family:Inter,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${PANEL};border:1px solid ${LINE};border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 28px 8px;border-bottom:1px solid ${LINE};">
          <div style="font-family:'IBM Plex Mono',Consolas,monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${ACCENT};">NordStar Pro</div>
        </td></tr>
        <tr><td style="padding:28px;">${body}</td></tr>
        <tr><td style="padding:18px 28px 26px;border-top:1px solid ${LINE};color:${INK_DIM};font-size:11px;line-height:1.6;">
          ${footerNote ? `<p style="margin:0 0 10px;">${footerNote}</p>` : ''}
          <p style="margin:0 0 10px;">Research is for educational and informational purposes only and is not financial advice. Trading involves substantial risk and past performance does not indicate future results.</p>
          <p style="margin:0;">NordStar Pro will never contact you privately to request money or offer account management via WhatsApp, Telegram, Discord or social media DMs.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;"><tr><td style="background:${ACCENT};border-radius:999px;">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 24px;font-weight:600;font-size:14px;color:#000000;text-decoration:none;">${escapeHtml(label)}</a>
  </td></tr></table>`
}

export function reportEmail(report: ReportSummary, reportUrl: string, firstName?: string | null) {
 
  const greeting = firstName ? `${escapeHtml(firstName)},` : 'Good morning,'
  const published = new Date(report.publishDate).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const body = `
    <p style="margin:0 0 18px;color:${INK_DIM};font-size:14px;">${greeting}</p>
    
    <h1 style="margin:0 0 12px;font-family:Inter,Helvetica,Arial,sans-serif;letter-spacing:-0.02em;font-size:25px;line-height:1.25;font-weight:500;color:${INK};">${escapeHtml(report.title)}</h1>
    <p style="margin:0 0 4px;color:${INK_DIM};font-size:13px;">${escapeHtml(published)}</p>
    ${report.summary ? `<p style="margin:16px 0 0;color:${INK};font-size:15px;line-height:1.65;">${escapeHtml(report.summary)}</p>` : ''}
    ${button(reportUrl, 'Read the report')}
    <p style="margin:14px 0 0;color:${INK_DIM};font-size:12px;line-height:1.6;">This link opens the report inside your member portal and requires you to be signed in. It is tied to your membership — forwarding it will not give anyone else access.</p>
  `

  return {
    subject: `${report.title}`, 
    html: shell(report.title, body),
    text:
      `${report.title}\n${published}\n\n` +
      `${report.summary ?? ''}\n\n` +
      `Read the report (sign-in required): ${reportUrl}\n\n` +
      `Educational and informational purposes only. Not financial advice.`,
  }
}

/**
 * The welcome, sent once when a membership becomes active.
 *
 * Fires at *redemption*, not at payment, because that is the one point every route
 * converges on — card, crypto and a gifted or referral code all end there — and it is
 * the first moment there is an account to welcome anybody to. Sending it from the
 * payment webhooks instead would greet card and crypto buyers and silently skip
 * everybody who arrived on a code.
 *
 * Warm, and short. It tells a new member what happens next and where to go; it does not
 * repeat the sales page at somebody who has already bought.
 */
/** The newest published edition, when there is one to point at. */
export type LatestReport = { title: string; url: string }

export function welcomeEmail(
  dashboardUrl: string,
  firstName?: string | null,
  reportsPerWeek = 3,
  latest?: LatestReport | null,
) {
  const greeting = firstName ? `Welcome, ${escapeHtml(firstName)}.` : 'Welcome aboard.'

  const body = `
    <div style="font-family:'IBM Plex Mono',Consolas,monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${ACCENT};margin-bottom:10px;">Membership active</div>
    <h1 style="margin:0 0 14px;font-family:Inter,Helvetica,Arial,sans-serif;letter-spacing:-0.02em;font-size:26px;line-height:1.25;font-weight:500;color:${INK};">${greeting}</h1>
    <p style="margin:0 0 18px;color:${INK};font-size:15px;line-height:1.7;">You are in. Your membership is active and the full archive is open to you from right now — not just what we publish next.</p>
    <p style="margin:0 0 18px;color:${INK};font-size:15px;line-height:1.7;">${reportsPerWeek} reports land each week. You will get an email the moment each one is published, with a link straight into your portal.</p>
    <p style="margin:0 0 6px;color:${INK_DIM};font-size:14px;line-height:1.7;">Two things worth knowing:</p>
    <ul style="margin:0 0 4px;padding-left:18px;color:${INK_DIM};font-size:14px;line-height:1.7;">
      <li style="margin-bottom:6px;">Reports open in the portal rather than in the email. Every link checks your session first, so nothing is readable without signing in.</li>
      <li>Your access is personal. Views and downloads are watermarked to your account.</li>
    </ul>
    ${
      latest
        ? `<div style="margin:22px 0 0;padding:16px 18px;background:#060606;border:1px solid ${LINE};border-radius:10px;">
             <div style="font-family:'IBM Plex Mono',Consolas,monospace;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${ACCENT};margin-bottom:6px;">Latest edition</div>
             <a href="${escapeHtml(latest.url)}" style="color:${INK};font-size:15px;line-height:1.5;text-decoration:none;">${escapeHtml(latest.title)}</a>
           </div>`
        : ''
    }
    ${button(dashboardUrl, 'Open your portal')}
    <p style="margin:14px 0 0;color:${INK_DIM};font-size:12px;line-height:1.6;">If you are opening this on a different device from the one you signed up on, you will be asked to sign in first — that is the paywall doing its job, not an error.</p>
    <p style="margin:10px 0 0;color:${INK_DIM};font-size:12px;line-height:1.6;">Reply to this email if you need anything — a person reads it.</p>
  `

  return {
    subject: 'Welcome to NordStar Pro',
    html: shell('Welcome to NordStar Pro', body),
    text:
      `${firstName ? `Welcome, ${firstName}.` : 'Welcome aboard.'}\n\n` +
      `Your membership is active and the full archive is open to you from right now.\n\n` +
      `${reportsPerWeek} reports land each week. You will get an email the moment each one ` +
      `is published, with a link straight into your portal.\n\n` +
      `Reports open in the portal, not in the email — every link checks your session ` +
      `first. Your access is personal, and views and downloads are watermarked to your ` +
      `account.\n\n` +
      (latest ? `Latest edition — ${latest.title}\n${latest.url}\n\n` : '') +
      `Open your portal: ${dashboardUrl}\n\n` +
      `If you are opening this on a different device from the one you signed up on, ` +
      `you will be asked to sign in first — that is the paywall doing its job, not an ` +
      `error.\n\n` +
      `Reply to this email if you need anything — a person reads it.`,
  }
}

/** One line of a receipt. */
export type ReceiptDetails = {
  /** Formatted for display — "199.00", not a float. */
  amount: string
  currency: string
  /** "Card" or "Crypto". */
  method: string
  /** The processor's own reference, so a query can be traced without guessing. */
  reference: string
  paidAt: Date
}

/**
 * A receipt for a payment that actually happened.
 *
 * Sent from the payment webhooks rather than at redemption, because this is the only
 * place the amount, currency and processor reference are known — and because a gifted or
 * referral code involves no payment, so there is nothing to receipt. A free member gets
 * the welcome and no receipt, which is correct rather than an omission.
 *
 * Deliberately plain. A receipt is a record somebody may forward to an accountant, so it
 * states what was paid, when, how, and against which reference, and sells nothing.
 */
export function receiptEmail(details: ReceiptDetails, firstName?: string | null) {
  const paid = details.paidAt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const total = `${escapeHtml(details.currency)} ${escapeHtml(details.amount)}`

  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:9px 0;border-bottom:1px solid ${LINE};color:${INK_DIM};font-size:13px;">${escapeHtml(label)}</td>
      <td style="padding:9px 0;border-bottom:1px solid ${LINE};color:${INK};font-size:13px;text-align:right;font-family:'IBM Plex Mono',Consolas,monospace;">${value}</td>
    </tr>`

  const body = `
    <p style="margin:0 0 18px;color:${INK_DIM};font-size:14px;">${firstName ? `${escapeHtml(firstName)},` : 'Hello,'}</p>
    <h1 style="margin:0 0 6px;font-family:Inter,Helvetica,Arial,sans-serif;letter-spacing:-0.02em;font-size:24px;line-height:1.3;font-weight:500;color:${INK};">Payment received</h1>
    <p style="margin:0 0 22px;color:${INK_DIM};font-size:14px;line-height:1.65;">Thank you. Keep this email for your records.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
      ${row('Item', 'NordStar Pro membership')}
      ${row('Amount', total)}
      ${row('Method', escapeHtml(details.method))}
      ${row('Date', escapeHtml(paid))}
      ${row('Reference', escapeHtml(details.reference))}
    </table>
    <p style="margin:20px 0 0;color:${INK_DIM};font-size:12px;line-height:1.6;">Your access code and activation link are in a separate email. If it has not arrived, check your spam folder before contacting us.</p>
  `

  return {
    subject: `Your NordStar Pro receipt — ${details.currency} ${details.amount}`,
    html: shell('Your NordStar Pro receipt', body),
    text:
      `Payment received. Thank you — keep this email for your records.\n\n` +
      `Item:      NordStar Pro membership\n` +
      `Amount:    ${details.currency} ${details.amount}\n` +
      `Method:    ${details.method}\n` +
      `Date:      ${paid}\n` +
      `Reference: ${details.reference}\n\n` +
      `Your access code and activation link are in a separate email.`,
  }
}

export function redemptionCodeEmail(code: string, redeemUrl: string, firstName?: string | null) {
  const greeting = firstName ? `${escapeHtml(firstName)},` : 'Welcome,'

  const body = `
    <p style="margin:0 0 18px;color:${INK_DIM};font-size:14px;">${greeting}</p>
    <h1 style="margin:0 0 14px;font-family:Inter,Helvetica,Arial,sans-serif;letter-spacing:-0.02em;font-size:25px;line-height:1.25;font-weight:500;color:${INK};">Your membership is confirmed</h1>
    <p style="margin:0 0 20px;color:${INK};font-size:15px;line-height:1.65;">Payment received. Use the code below to create your account and unlock every weekly report plus the full archive.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:#060606;border:1px solid ${LINE};border-radius:10px;padding:20px;">
      <div style="font-family:'IBM Plex Mono',Consolas,monospace;font-size:24px;letter-spacing:.14em;color:${ACCENT};">${escapeHtml(code)}</div>
    </td></tr></table>
    ${button(redeemUrl, 'Activate my membership')}
    <p style="margin:14px 0 0;color:${INK_DIM};font-size:12px;line-height:1.6;">Keep this code private. It can only be redeemed once, and it expires ${CODE_VALIDITY_DAYS} days from today.</p>
  `

  return {
    subject: 'Your NordStar Pro access code',
    html: shell('Your NordStar Pro access code', body),
    text:
      `Your membership is confirmed.\n\nAccess code: ${code}\n\n` +
      `Activate your membership: ${redeemUrl}\n\n` +
      `This code can only be redeemed once, and it expires ${CODE_VALIDITY_DAYS} days from today.`,
  }
}

export function magicLinkEmail(link: string, expiresInMinutes: number, firstName?: string | null) {
  const greeting = firstName ? `${escapeHtml(firstName)},` : 'Hello,'

  const body = `
    <p style="margin:0 0 18px;color:${INK_DIM};font-size:14px;">${greeting}</p>
    <h1 style="margin:0 0 14px;font-family:Inter,Helvetica,Arial,sans-serif;letter-spacing:-0.02em;font-size:25px;line-height:1.25;font-weight:500;color:${INK};">Your sign-in link</h1>
    <p style="margin:0 0 4px;color:${INK};font-size:15px;line-height:1.65;">Click below to sign in to your NordStar Pro account. The link expires in ${expiresInMinutes} minutes.</p>
    ${button(link, 'Sign in')}
    <p style="margin:14px 0 0;color:${INK_DIM};font-size:12px;line-height:1.6;">If you did not ask to sign in, you can ignore this email — nobody can access your account without this link.</p>
  `

  return {
    subject: 'Your NordStar Pro sign-in link',
    html: shell('Your sign-in link', body),
    text: `Sign in to NordStar Pro:\n${link}\n\nThis link expires in ${expiresInMinutes} minutes.`,
  }
}

export function renewalReminderEmail(
  daysRemaining: number,
  renewUrl: string,
  firstName?: string | null,
) {
  const greeting = firstName ? `${escapeHtml(firstName)},` : 'Hello,'
  const when =
    daysRemaining <= 0
      ? 'has ended'
      : daysRemaining === 1
        ? 'ends tomorrow'
        : `ends in ${daysRemaining} days`

  const body = `
    <p style="margin:0 0 18px;color:${INK_DIM};font-size:14px;">${greeting}</p>
    <h1 style="margin:0 0 14px;font-family:Inter,Helvetica,Arial,sans-serif;letter-spacing:-0.02em;font-size:25px;line-height:1.25;font-weight:500;color:${INK};">Your membership ${escapeHtml(when)}</h1>
    <p style="margin:0 0 4px;color:${INK};font-size:15px;line-height:1.65;">You pay by crypto, which cannot renew automatically, so your access needs a payment to continue. Renew now and your reports carry on uninterrupted — any time left on your current period is added on top.</p>
    ${button(renewUrl, 'Renew my membership')}
    <p style="margin:14px 0 0;color:${INK_DIM};font-size:12px;line-height:1.6;">Prefer not to think about it each month? Switching to card billing renews by itself and can be cancelled any time.</p>
  `

  return {
    subject:
      daysRemaining <= 0
        ? 'Your NordStar Pro membership has ended'
        : `Your NordStar Pro membership ${when}`,
    html: shell('Membership renewal', body),
    text: `Your NordStar Pro membership ${when}.\n\nRenew: ${renewUrl}`,
  }
}

/**
 * Internal notification to the desk. Deliberately plain: it is read by us, and it
 * contains no link that could deliver research to the enquirer.
 */
export function sampleReportRequestEmail(request: {
  name: string
  email: string
  note?: string
}) {
  const body = `
    <p style="margin:0 0 18px;color:${INK_DIM};font-size:14px;">New sample report request</p>
    <h1 style="margin:0 0 14px;font-family:Inter,Helvetica,Arial,sans-serif;letter-spacing:-0.02em;font-size:22px;line-height:1.3;font-weight:600;color:${INK};">${escapeHtml(request.name)}</h1>
    <p style="margin:0 0 6px;color:${INK};font-size:15px;">${escapeHtml(request.email)}</p>
    ${request.note ? `<p style="margin:14px 0 0;color:${INK_DIM};font-size:14px;line-height:1.65;">${escapeHtml(request.note)}</p>` : ''}
    <p style="margin:20px 0 0;color:${INK_DIM};font-size:12px;line-height:1.6;">Nothing has been sent to this person. Reply directly if you want to follow up.</p>
  `

  return {
    subject: `Sample report request — ${request.name}`,
    html: shell('Sample report request', body),
    text:
      `New sample report request\n\n${request.name}\n${request.email}\n\n` +
      `${request.note ?? ''}\n\nNothing has been sent to this person.`,
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
