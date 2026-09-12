'use client'

import { useRouter } from 'next/navigation'
import * as React from 'react'

import { Button, Spinner } from '@/components/ui/button'

/**
 * Start a trial from inside the portal.
 *
 * The API always supported this — a signed-in request with no body grants the trial to
 * whoever is signed in — and the interface never offered it. The consequence was a
 * promise that led nowhere: somebody whose email already had an account was told by the
 * signup form to "sign in and start your trial from there", signed in, and found no such
 * button anywhere. Worse than not offering it at all, because they did as they were told.
 *
 * Shown only to somebody who could actually take it up: trials open, and this member has
 * never held the item. That last part is judged on ever, not currently, so an expired
 * trial does not quietly reappear as a fresh offer.
 */
export function TrialOffer({ days, itemName }: { days: number; itemName: string }) {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function start() {
    setPending(true)
    setError(null)
    try {
      // No body: the route reads the session and grants the trial to that member.
      const response = await fetch('/api/trial', { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError(body.error ?? 'That did not work. Please try again.')
        return
      }
      router.refresh()
    } catch {
      setError('Could not reach the server.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mb-8 rounded-lg border border-accent/35 bg-accent/[0.06] px-5 py-4">
      <p className="text-[15px] text-ink">
        Try {itemName} free for {days} days
      </p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">
        No card. It stops on its own after {days} days — there is nothing to cancel.
      </p>

      {error && (
        <p role="alert" className="mt-3 text-[13px] text-down">
          {error}
        </p>
      )}

      <Button type="button" size="sm" onClick={start} disabled={pending} className="mt-4">
        {pending && <Spinner />}
        {pending ? 'Setting it up…' : `Start my ${days}-day trial`}
      </Button>
    </div>
  )
}
