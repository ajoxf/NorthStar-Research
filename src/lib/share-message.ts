/**
 * The message an operator sends when sharing a report.
 *
 * Kept here, in one place, rather than inline in a component: it is copy, it will be
 * reworded, and a message that exists in two places drifts until the WhatsApp version and
 * the copied version say different things.
 *
 * Deliberately two lines. This is pasted into a chat, where a paragraph reads as a
 * broadcast and gets skimmed — the title earns the tap, the link takes it.
 *
 * The URL is the *invite* link, not the plain report link. Sending someone a report link
 * they cannot open lands them on a sign-in page with no explanation; the invite link
 * carries them through activation and back to that report.
 */

export type ShareableReport = {
  id: string
  title: string
  /** A line written for people who are not members yet. Optional. */
  shareHook?: string | null
}

/** Where a shared link points: redemption, returning to this report afterwards. */
export function reportInviteUrl(baseUrl: string, reportId: string, code?: string | null): string {
  const params = new URLSearchParams()
  if (code?.trim()) params.set('code', code.trim())
  params.set('next', `/reports/${reportId}`)
  return `${baseUrl}/redeem?${params.toString()}`
}

/**
 * Two lines: a hook, then the link.
 *
 * When a hook has been written for the report it leads, because that is the only line
 * that gets read in a chat — and a masthead means nothing to somebody who is not a member
 * yet, which is exactly who this link is for. The title is the fallback, not the ideal:
 * "NordStar Pro — Ahead of the Curve" tells a stranger nothing, while "Dollar, gold,
 * silver and oil, all turning at once" tells them whether to tap.
 */
export function reportShareMessage(
  report: ShareableReport,
  baseUrl: string,
  code?: string | null,
): string {
  const url = reportInviteUrl(baseUrl, report.id, code)
  const hook = report.shareHook?.trim()
  if (hook) return `${hook}\n\nRead it here: ${url}`
  return `New from NordStar Pro — ${report.title}\n\nRead it here: ${url}`
}

/**
 * A WhatsApp share link.
 *
 * `wa.me` with no number opens the contact picker with the text ready, which is what makes
 * this one tap rather than a copy-paste-and-find-the-chat. It works on the app and on
 * WhatsApp Web, so it behaves the same whether the operator is on a phone or a desktop.
 */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`
}
