'use client'

import * as React from 'react'
import { Check, Copy } from 'lucide-react'

/**
 * Copy the share message, next to the WhatsApp link.
 *
 * Copy is the half WhatsApp cannot cover: Telegram, a DM, an email, a note to paste
 * later. The two sit together because the decision an operator is making is "share this
 * report", not "choose a protocol".
 *
 * The message is built server-side and passed in whole, so this component never rebuilds
 * it — the list, the report page and the clipboard cannot end up saying different things.
 */
export function CopyShareMessage({ message }: { message: string }) {
  const [copied, setCopied] = React.useState(false)

  return (
    <button
      type="button"
      title="Copy the share message"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(message)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // Clipboard access can be refused. The WhatsApp link still works, and the
          // report's own page shows the message as selectable text.
        }
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded border border-line px-2 py-0.5 font-mono text-[11px] text-ink-dim transition-colors hover:border-accent/50 hover:text-ink"
    >
      {copied ? (
        <Check className="h-3 w-3 text-up" aria-hidden />
      ) : (
        <Copy className="h-3 w-3" aria-hidden />
      )}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
