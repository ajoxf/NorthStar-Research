'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * Approve or decline a partner application. Approving makes them active on the terms shown
 * on their page and sends their sign-in invite; declining keeps the record and sends nothing.
 */
export function ApplicationReview({ affiliateId, name }: { affiliateId: string; name: string }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = React.useState<'approve' | 'decline' | null>(null)

  async function review(decision: 'approve' | 'decline') {
    if (decision === 'decline' && !window.confirm(`Decline ${name}'s application? Nothing is sent to them.`)) return
    setPending(decision)
    const response = await fetch(`/api/admin/affiliates/${affiliateId}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setPending(null)
    if (!response?.ok) return toast(body?.error ?? 'Could not save that. Try again.', 'error')
    toast(body?.message ?? 'Saved', body?.invited === false && decision === 'approve' ? 'error' : 'success')
    router.refresh()
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => review('approve')} disabled={pending !== null}>
        {pending === 'approve' && <Spinner />}
        Approve
      </Button>
      <Button size="sm" variant="secondary" onClick={() => review('decline')} disabled={pending !== null}>
        {pending === 'decline' && <Spinner />}
        Decline
      </Button>
    </div>
  )
}
