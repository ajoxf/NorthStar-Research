'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Button, Spinner } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

export type Submission = {
  id: string
  title: string
  section: string | null
  submittedAt: string
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
  note: string | null
  publishedAt: string | null
}

const STATUS: Record<Submission['status'], { label: string; tone: 'accent' | 'up' | 'muted' }> = {
  pending: { label: 'Waiting for review', tone: 'accent' },
  approved: { label: 'Published', tone: 'up' },
  rejected: { label: 'Sent back', tone: 'muted' },
  withdrawn: { label: 'Withdrawn', tone: 'muted' },
}

/** The expert's own uploads and where each stands. A waiting one can be taken back. */
export function ReportSubmissions({ submissions }: { submissions: Submission[] }) {
  if (submissions.length === 0) {
    return <p className="px-5 py-8 text-center text-[15px] text-ink-dim">You have not uploaded a report yet.</p>
  }
  return (
    <ul className="divide-y divide-line/60">
      {submissions.map((submission) => (
        <Row key={submission.id} submission={submission} />
      ))}
    </ul>
  )
}

function Row({ submission }: { submission: Submission }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = React.useState(false)

  async function withdraw() {
    if (!window.confirm('Withdraw this report? The team will not publish it. You can upload it again later.')) return
    setBusy(true)
    const response = await fetch(`/api/expert/reports/${submission.id}/withdraw`, { method: 'POST' }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy(false)
    if (!response?.ok) return toast(body?.error ?? 'Could not withdraw it. Try again.', 'error')
    toast('Withdrawn', 'success')
    router.refresh()
  }

  const status = STATUS[submission.status]
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
      <div className="min-w-0">
        <div className="text-[15px] text-ink">{submission.title}</div>
        <div className="mt-0.5 text-[13px] text-ink-dim">
          {submission.section ?? 'No section'} · sent {submission.submittedAt}
          {submission.publishedAt ? ` · published ${submission.publishedAt}` : ''}
        </div>
        {submission.status === 'rejected' && submission.note && (
          <p className="mt-2 text-[14px] leading-relaxed text-ink">Sent back: {submission.note}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={status.tone}>{status.label}</Badge>
        {submission.status === 'pending' && (
          <Button size="sm" variant="secondary" onClick={withdraw} disabled={busy}>
            {busy && <Spinner />}
            Withdraw
          </Button>
        )}
      </div>
    </li>
  )
}
