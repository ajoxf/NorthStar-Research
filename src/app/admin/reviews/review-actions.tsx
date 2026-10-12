'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/** Approve or reject one review. */
export function ReviewActions({ reviewId }: { reviewId: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = React.useState<'approve' | 'reject' | null>(null)

  async function decide(decision: 'approve' | 'reject') {
    setPending(decision)
    const response = await fetch(`/api/admin/reviews/${reviewId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setPending(null)
    if (!response?.ok) return toast(body?.error ?? 'Could not save that. Try again.', 'error')
    toast(decision === 'approve' ? 'Review approved — it is live' : 'Review rejected', 'success')
    router.refresh()
  }

  return (
    <div className="flex gap-2">
      <Button size="sm" onClick={() => decide('approve')} disabled={pending !== null}>
        {pending === 'approve' && <Spinner />}
        Approve
      </Button>
      <Button size="sm" variant="secondary" onClick={() => decide('reject')} disabled={pending !== null}>
        {pending === 'reject' && <Spinner />}
        Reject
      </Button>
    </div>
  )
}
