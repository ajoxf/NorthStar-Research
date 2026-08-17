'use client'

import * as React from 'react'
import { Check, Copy } from 'lucide-react'

import { reportShareMessage, whatsappShareUrl } from '@/lib/share-message'
import { cn } from '@/lib/utils'

/**
 * Share a report to WhatsApp, from the list, in one tap.
 *
 * The link opens WhatsApp with the message already written, so the operator picks a
 * contact and sends. No copying, no switching apps to find the chat, no rebuilding the
 * URL by hand — which is what was happening before, and what made sharing something you
 * did occasionally rather than every time.
 *
 * A copy button sits beside it for everywhere that is not WhatsApp: email, Telegram,
 * a Slack channel, a note to yourself.
 */
export function ShareReportButton({
  report,
  baseUrl,
  className,
}: {
  report: { id: string; title: string }
  baseUrl: string
  className?: string
}) {
  const [copied, setCopied] = React.useState(false)
  const message = reportShareMessage(report, baseUrl)

  return (
    <div className={cn('flex w-[62px] shrink-0 items-center gap-1', className)}>
      <a
        href={whatsappShareUrl(message)}
        target="_blank"
        rel="noreferrer noopener"
        title="Share on WhatsApp"
        className="inline-flex h-[26px] w-7 items-center justify-center rounded border border-line text-ink-dim transition-colors hover:border-up/50 hover:text-up"
      >
        <WhatsAppMark />
        <span className="sr-only">Share on WhatsApp</span>
      </a>

      <button
        type="button"
        title="Copy the message"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(message)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          } catch {
            // Clipboard access can be refused; the WhatsApp link still works.
          }
        }}
        className="inline-flex h-[26px] w-7 items-center justify-center rounded border border-line text-ink-dim transition-colors hover:text-ink"
      >
        {copied ? (
          <Check className="h-3 w-3 text-up" aria-hidden />
        ) : (
          <Copy className="h-3 w-3" aria-hidden />
        )}
        <span className="sr-only">Copy the share message</span>
      </button>
    </div>
  )
}

/**
 * Inline rather than an icon-set import: lucide has no WhatsApp glyph.
 *
 * The explicit `width`/`height` are load-bearing, not decoration. Without them an inline
 * SVG falls back to its replaced-element default of 300x150 for intrinsic sizing, and a
 * row of them widened the reports table enough to make the whole admin page scroll
 * sideways on a phone — with no element reporting as an overflow, because each one
 * *renders* at 12px once the class applies.
 */
function WhatsAppMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      className="h-3 w-3 shrink-0"
      fill="currentColor"
      aria-hidden
    >
      <path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.53.07-.8.38-.28.3-1.05 1.02-1.05 2.5s1.08 2.9 1.23 3.1c.15.2 2.12 3.24 5.14 4.54.72.31 1.28.5 1.71.64.72.23 1.37.2 1.89.12.58-.09 1.76-.72 2.01-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35z" />
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.22 8.22 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23a8.23 8.23 0 0 1 0 16.47z" />
    </svg>
  )
}
