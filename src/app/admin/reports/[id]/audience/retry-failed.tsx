'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * Send this edition again to the people it failed for.
 *
 * Only those people. A re-publish would walk the whole list — which the delivery log
 * would mostly skip, so the outcome is the same, but an operator clicking "retry 2" must
 * not start a job against four hundred members.
 *
 * Confirmed first, because it puts real email in front of real members and there is no
 * unsend.
 */
export function RetryFailed({ reportId, count }: { reportId: string; count: number }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = React.useState(false)

  async function retry() {
    if (
      !window.confirm(
        `Send this report again to the ${count} member${count === 1 ? '' : 's'} it failed for?\n\n` +
          `Nobody else is emailed. Members who have lapsed since are skipped.`,
      )
    ) {
      return
    }

    setPending(true)
    try {
      const response = await fetch(`/api/admin/reports/${reportId}/retry-failed`, { method: 'POST' })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        toast(data?.error ?? `That did not work (HTTP ${response.status}).`, 'error')
        return
      }

      // The counts, not a generic success: a retry that failed again is the thing the
      // operator most needs to know, and "done" would hide it.
      const parts = [`${data.sent} sent`]
      if (data.failed > 0) parts.push(`${data.failed} failed again`)
      if (data.skippedInactive > 0) parts.push(`${data.skippedInactive} skipped as lapsed`)

      toast(parts.join(', '), data.failed > 0 ? 'error' : 'success')
      router.refresh()
    } catch {
      toast('Could not reach the server.', 'error')
    } finally {
      setPending(false)
    }
  }

  return (
    <Button size="sm" variant="secondary" onClick={retry} disabled={pending}>
      {pending ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden />}
      {pending ? 'Sending…' : `Retry ${count} failed`}
    </Button>
  )
}
