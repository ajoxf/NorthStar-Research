'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'

/**
 * "Mark as paid…" for one order. Opens a small panel that says what this does — and that
 * it is only for money that has actually arrived — before anything is sent.
 */
export function MarkPaid({ orderId, reference, amount }: { orderId: string; reference: string; amount: string }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [message, setMessage] = React.useState<{ tone: 'up' | 'down'; text: string } | null>(null)
  const [ref, setRef] = React.useState('')

  async function confirm() {
    setPending(true)
    setMessage(null)
    try {
      const response = await fetch(`/api/admin/orders/${orderId}/mark-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ref.trim() ? { reference: ref.trim() } : {}),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setMessage({ tone: 'down', text: data.error ?? 'It could not be marked as paid.' })
        return
      }
      setMessage({ tone: 'up', text: 'Marked as paid. The buyer has been given access and sent a receipt.' })
      router.refresh()
    } catch {
      setMessage({ tone: 'down', text: 'It could not be marked as paid.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} aria-expanded={open}>
        Mark as paid…
      </Button>
      {open && (
        // Fixed, not anchored to the row: the table scrolls sideways, and a panel inside it
        // would be cut off on a short table or a phone.
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false)
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Mark ${reference} as paid`}
            className="w-full max-w-sm rounded-lg border border-line bg-panel p-5 text-left shadow-xl"
          >
            <p className="text-[15px] font-medium text-ink">Only after the money has arrived</p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink-dim">
              Order <span className="font-mono text-ink">{reference}</span> · <span className="font-mono text-ink">{amount}</span>.
              This gives the buyer access and emails their receipt.
            </p>
            <div className="mt-3">
              <Label htmlFor={`ref-${orderId}`}>Reference (optional)</Label>
              <Input
                id={`ref-${orderId}`}
                value={ref}
                onChange={(event) => setRef(event.target.value)}
                placeholder="Bank reference, transaction id…"
                maxLength={200}
              />
            </div>
            {message && <p className={`mt-3 text-[14px] ${message.tone === 'up' ? 'text-up' : 'text-down'}`}>{message.text}</p>}
            <div className="mt-4 flex gap-2">
              <Button size="sm" onClick={confirm} disabled={pending}>
                {pending && <Spinner />}
                Mark as paid
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
