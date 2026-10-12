'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

/**
 * The review bar on a report an expert uploaded. Approving is publishing — the same send
 * the Publish button below makes — so there is one decision, not two.
 */
export function SubmissionReview({
  reportId,
  expert,
  submittedAt,
  status,
  note,
  hasPdf,
}: {
  reportId: string
  expert: string
  submittedAt: string
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  note: string | null
  hasPdf: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = React.useState<'publish' | 'reject' | null>(null)
  const [rejecting, setRejecting] = React.useState(false)
  const [reason, setReason] = React.useState('')

  async function publish() {
    if (!window.confirm('Publish this report and send it to the section’s subscribers now?')) return
    setBusy('publish')
    const response = await fetch(`/api/admin/reports/${reportId}/publish`, { method: 'POST' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy(null)
    if (!response?.ok) return toast(body?.error ?? 'Could not publish. Try again.', 'error')
    toast(`Published — ${expert} has been told`, 'success')
    router.refresh()
  }

  async function sendBack() {
    setBusy('reject')
    const response = await fetch(`/api/admin/reports/${reportId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy(null)
    if (!response?.ok) return toast(body?.error ?? 'Could not save that. Try again.', 'error')
    toast(`Sent back to ${expert}`, 'success')
    router.refresh()
  }

  return (
    <section className="mt-6 rounded-xl border border-accent/40 bg-accent/5 p-5">
      <h2 className="text-[17px] text-ink">
        Submitted by {expert} on {submittedAt}
      </h2>
      {status === 'pending' && (
        <>
          <p className="mt-2 text-[15px] leading-relaxed text-ink-dim">
            Waiting for your review. Check the details and the document below — edit anything you need to — then publish it,
            or send it back with a reason. Nothing has gone to members.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={publish} disabled={busy !== null || !hasPdf}>
              {busy === 'publish' && <Spinner />}
              Approve and publish
            </Button>
            {rejecting ? (
              <>
                <Input
                  aria-label="Why it is being sent back"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Why — they will see this"
                  maxLength={500}
                  className="max-w-sm"
                />
                <Button size="sm" variant="secondary" onClick={sendBack} disabled={busy !== null || !reason.trim()}>
                  {busy === 'reject' && <Spinner />}
                  Send back
                </Button>
              </>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => setRejecting(true)} disabled={busy !== null}>
                Send back…
              </Button>
            )}
          </div>
          {!hasPdf && <p className="mt-2 text-[14px] text-ink-dim">There is no PDF yet — attach one below before publishing.</p>}
        </>
      )}
      {status === 'approved' && <p className="mt-2 text-[15px] text-ink-dim">Approved and published.</p>}
      {status === 'rejected' && <p className="mt-2 text-[15px] text-ink-dim">Sent back: {note}</p>}
      {status === 'withdrawn' && <p className="mt-2 text-[15px] text-ink-dim">Withdrawn by the expert before review. It cannot be published.</p>}
    </section>
  )
}
