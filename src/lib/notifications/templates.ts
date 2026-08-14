import { reportTypeLabel } from '@/lib/report-content'
import type { ReportSummary } from '@/lib/notifications/types'

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

const BG = '#08090B'
const PANEL = '#0E1013'
const LINE = '#1E2228'
const INK = '#F2F4F7'
const INK_DIM = '#8A93A0'
const ACCENT = '#00E0FF'

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
          <div style="font-family:'IBM Plex Mono',Consolas,monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:${ACCENT};">NorthStar Research</div>
        </td></tr>
        <tr><td style="padding:28px;">${body}</td></tr>
        <tr><td style="padding:18px 28px 26px;border-top:1px solid ${LINE};color:${INK_DIM};font-size:11px;line-height:1.6;">
          ${footerNote ? `<p style="margin:0 0 10px;">${footerNote}</p>` : ''}
          <p style="margin:0 0 10px;">Research is for educational and informational purposes only and is not financial advice. Trading involves substantial risk and past performance does not indicate future results.</p>
          <p style="margin:0;">NorthStar Research will never contact you privately to request money or offer account management via WhatsApp, Telegram, Discord or social media DMs.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;"><tr><td style="background:${ACCENT};border-radius:999px;">
    <a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 24px;font-weight:600;font-size:14px;color:#08090B;text-decoration:none;">${escapeHtml(label)}</a>
  </td></tr></table>`
}

export function reportEmail(report: ReportSummary, reportUrl: string, firstName?: string | null) {
  const typeLabel = reportTypeLabel(report.type)
  const greeting = firstName ? `${escapeHtml(firstName)},` : 'Good morning,'
  const published = new Date(report.publishDate).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const body = `
    <p style="margin:0 0 18px;color:${INK_DIM};font-size:14px;">${greeting}</p>
    <div style="font-family:'IBM Plex Mono',Consolas,monospace;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:${ACCENT};margin-bottom:8px;">${escapeHtml(typeLabel)}</div>
    <h1 style="margin:0 0 12px;font-family:Newsreader,Georgia,serif;font-size:25px;line-height:1.25;font-weight:500;color:${INK};">${escapeHtml(report.title)}</h1>
    <p style="margin:0 0 4px;color:${INK_DIM};font-size:13px;">${escapeHtml(published)}</p>
    ${report.summary ? `<p style="margin:16px 0 0;color:${INK};font-size:15px;line-height:1.65;">${escapeHtml(report.summary)}</p>` : ''}
    ${button(reportUrl, 'Read the report')}
    <p style="margin:14px 0 0;color:${INK_DIM};font-size:12px;line-height:1.6;">This link opens the report inside your member portal and requires you to be signed in. It is tied to your membership — forwarding it will not give anyone else access.</p>
  `

  return {
    subject: `${typeLabel}: ${report.title}`,
    html: shell(report.title, body),
    text:
      `${typeLabel}\n${report.title}\n${published}\n\n` +
      `${report.summary ?? ''}\n\n` +
      `Read the report (sign-in required): ${reportUrl}\n\n` +
      `Educational and informational purposes only. Not financial advice.`,
  }
}

export function redemptionCodeEmail(code: string, redeemUrl: string, firstName?: string | null) {
  const greeting = firstName ? `${escapeHtml(firstName)},` : 'Welcome,'

  const body = `
    <p style="margin:0 0 18px;color:${INK_DIM};font-size:14px;">${greeting}</p>
    <h1 style="margin:0 0 14px;font-family:Newsreader,Georgia,serif;font-size:25px;line-height:1.25;font-weight:500;color:${INK};">Your membership is confirmed</h1>
    <p style="margin:0 0 20px;color:${INK};font-size:15px;line-height:1.65;">Payment received. Use the code below to create your account and unlock all four weekly reports plus the full archive.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:#0B0C0F;border:1px solid ${LINE};border-radius:10px;padding:20px;">
      <div style="font-family:'IBM Plex Mono',Consolas,monospace;font-size:24px;letter-spacing:.14em;color:${ACCENT};">${escapeHtml(code)}</div>
    </td></tr></table>
    ${button(redeemUrl, 'Activate my membership')}
    <p style="margin:14px 0 0;color:${INK_DIM};font-size:12px;line-height:1.6;">Keep this code private. It can only be redeemed once.</p>
  `

  return {
    subject: 'Your NorthStar Research access code',
    html: shell('Your NorthStar Research access code', body),
    text:
      `Your membership is confirmed.\n\nAccess code: ${code}\n\n` +
      `Activate your membership: ${redeemUrl}\n\nThis code can only be redeemed once.`,
  }
}

export function magicLinkEmail(link: string, expiresInMinutes: number, firstName?: string | null) {
  const greeting = firstName ? `${escapeHtml(firstName)},` : 'Hello,'

  const body = `
    <p style="margin:0 0 18px;color:${INK_DIM};font-size:14px;">${greeting}</p>
    <h1 style="margin:0 0 14px;font-family:Newsreader,Georgia,serif;font-size:25px;line-height:1.25;font-weight:500;color:${INK};">Your sign-in link</h1>
    <p style="margin:0 0 4px;color:${INK};font-size:15px;line-height:1.65;">Click below to sign in to your NorthStar Research account. The link expires in ${expiresInMinutes} minutes.</p>
    ${button(link, 'Sign in')}
    <p style="margin:14px 0 0;color:${INK_DIM};font-size:12px;line-height:1.6;">If you did not ask to sign in, you can ignore this email — nobody can access your account without this link.</p>
  `

  return {
    subject: 'Your NorthStar Research sign-in link',
    html: shell('Your sign-in link', body),
    text: `Sign in to NorthStar Research:\n${link}\n\nThis link expires in ${expiresInMinutes} minutes.`,
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
    <h1 style="margin:0 0 14px;font-family:Newsreader,Georgia,serif;font-size:25px;line-height:1.25;font-weight:500;color:${INK};">Your membership ${escapeHtml(when)}</h1>
    <p style="margin:0 0 4px;color:${INK};font-size:15px;line-height:1.65;">You pay by crypto, which cannot renew automatically, so your access needs a payment to continue. Renew now and your reports carry on uninterrupted — any time left on your current period is added on top.</p>
    ${button(renewUrl, 'Renew my membership')}
    <p style="margin:14px 0 0;color:${INK_DIM};font-size:12px;line-height:1.6;">Prefer not to think about it each month? Switching to card billing renews by itself and can be cancelled any time.</p>
  `

  return {
    subject:
      daysRemaining <= 0
        ? 'Your NorthStar Research membership has ended'
        : `Your NorthStar Research membership ${when}`,
    html: shell('Membership renewal', body),
    text: `Your NorthStar Research membership ${when}.\n\nRenew: ${renewUrl}`,
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
