'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Archive, Copy, RotateCcw, Send } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

/**
 * Send this person their pricing.
 *
 * The optional note is what makes this a reply rather than a broadcast — an operator can
 * answer whatever they actually asked before the payment button. The price itself is not
 * editable here on purpose: it is read from the package at send time, because a figure
 * typed by hand is exactly how the email and the checkout come to disagree.
 */
export function EnquiryActions({
  id,
  name,
  status,
  joinUrl,
}: {
  id: string
  name: string
  status: string
  joinUrl: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [message, setMessage] = React.useState('')
  const [pending, setPending] = React.useState<string | null>(null)

  async function act(action: 'send' | 'close' | 'reopen', success: string) {
    setPending(action)
    try {
      const response = await fetch(`/api/admin/enquiries/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, message: message || undefined }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        // The provider's own words: this is the same class of failure as the rest of the
        // mail in this product, and softening it hides the fix.
        toast(data?.error ?? `That did not work (HTTP ${response.status}).`, 'error')
        return
      }

      toast(success, 'success')
      setOpen(false)
      setMessage('')
      router.refresh()
    } catch {
      toast('Could not reach the server.', 'error')
    } finally {
      setPending(null)
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl)
      toast('Payment link copied', 'success')
    } catch {
      toast('Could not copy — select the link and copy it by hand.', 'error')
    }
  }

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setOpen((value) => !value)}>
          <Send className="h-3.5 w-3.5" aria-hidden />
          {status === 'invited' ? 'Send again' : 'Send pricing'}
        </Button>

        {/* For WhatsApp, where the operator sends the link themselves. */}
        <Button size="sm" variant="ghost" onClick={copyLink}>
          <Copy className="h-3.5 w-3.5" aria-hidden />
          Copy link
        </Button>

        {status === 'closed' ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending !== null}
            onClick={() => act('reopen', 'Reopened')}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Reopen
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending !== null}
            onClick={() => act('close', 'Set aside')}
          >
            <Archive className="h-3.5 w-3.5" aria-hidden />
            Set aside
          </Button>
        )}
      </div>

      {open && (
        <div className="mt-3 rounded-lg border border-line bg-panel-2 p-4">
          <Textarea
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={`A line to ${name.split(' ')[0]} — answering what they asked, if anything. Optional.`}
          />
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" disabled={pending !== null} onClick={() => act('send', 'Pricing sent')}>
              {pending === 'send' && <Spinner />}
              {pending === 'send' ? 'Sending…' : 'Send the email'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <span className="font-mono text-[11px] text-ink-dim">
              The price comes from the default package.
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
