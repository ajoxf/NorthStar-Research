'use client'

import * as React from 'react'
import { Check, Copy } from 'lucide-react'

import { Hint, Input, Label } from '@/components/ui/field'

/**
 * The two links for putting a report in front of somebody.
 *
 * They differ by who is on the other end, and getting that wrong is the difference
 * between a working invitation and a dead end:
 *
 *   - **Member link** — for people who already have an account. It opens the report,
 *     asking them to sign in first if they are on a device without a session.
 *   - **Invite link** — for people who do not. It opens the redemption flow, and lands
 *     them on *this report* once they have activated, rather than the dashboard.
 *
 * Sending the member link to a non-member is the trap this exists to prevent: they sign
 * in, have no membership, and are bounced to /redeem with no idea what they were
 * originally sent. The invite link makes that path deliberate instead of accidental.
 *
 * Neither link exposes the report. Both end at the same paywall — the invite one simply
 * remembers where the person was heading.
 */
export function ShareLinks({ reportId, baseUrl }: { reportId: string; baseUrl: string }) {
  const [code, setCode] = React.useState('')

  const memberLink = `${baseUrl}/reports/${reportId}`

  const params = new URLSearchParams()
  if (code.trim()) params.set('code', code.trim())
  params.set('next', `/reports/${reportId}`)
  const inviteLink = `${baseUrl}/redeem?${params.toString()}`

  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <h2 className="text-[15px] text-ink">Share this report</h2>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-dim">
        Both links respect the paywall. Nobody reads the report without an active membership.
      </p>

      <div className="mt-5">
        <Label htmlFor="share-code">Access code — optional</Label>
        <Input
          id="share-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="NSR-XXXX-XXXX"
          className="font-mono text-[13px]"
          autoComplete="off"
        />
        <Hint>
          Generate one under Codes. Adding it here fills it in for them, so the invite is a
          single tap — no copying a code out of a message. Leave it blank and they will be
          asked for a code they already have.
        </Hint>
      </div>

      <div className="mt-5 space-y-4">
        <CopyRow
          label="Invite link — for someone who is not a member yet"
          value={inviteLink}
          note="Opens redemption. After they activate, they land on this report."
        />
        <CopyRow
          label="Member link — for existing members"
          value={memberLink}
          note="Opens the report directly, after sign-in if needed."
        />
      </div>
    </div>
  )
}

function CopyRow({ label, value, note }: { label: string; value: string; note: string }) {
  const [copied, setCopied] = React.useState(false)

  return (
    <div>
      <div className="flex items-start justify-between gap-3 rounded-lg border border-line bg-panel-2 px-3.5 py-3">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">{label}</p>
          <p className="mt-1 break-all font-mono text-[12px] text-ink">{value}</p>
        </div>

        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            } catch {
              // Clipboard access can be refused. The text is on screen and selectable.
            }
          }}
          className="shrink-0 rounded border border-line px-2.5 py-1.5 text-ink-dim transition-colors hover:text-ink"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-up" aria-hidden />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="sr-only">Copy — {label}</span>
        </button>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink-dim">{note}</p>
    </div>
  )
}
