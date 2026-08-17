'use client'

import * as React from 'react'
import { Bitcoin, CreditCard } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button, Spinner } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

/**
 * A real dollar, through the real pipe.
 *
 * Everything else on this screen inspects configuration. This is the only control that
 * answers the question configuration cannot: does a payment actually reach us? Money
 * moves, the processor calls back, the signature is verified, and an order lands in the
 * payments list — which is exactly the path a stuck checkout fails somewhere along.
 *
 * It grants nothing. The order is flagged as a test and both webhooks stop at recording
 * it: no code, no member, no email. That guard lives on the server, not here, because a
 * client-side promise about what a webhook does is not a guard.
 */
export type TestState = {
  stripeReady: boolean
  cregisReady: boolean
  /** Where the charge lands, so nobody is surprised by it. */
  adminEmail: string
  recent: { id: string; provider: string; amount: string; status: string; when: string }[]
}

const TONE: Record<string, 'up' | 'accent' | 'down' | 'muted'> = {
  paid: 'up',
  pending: 'accent',
  failed: 'down',
  expired: 'muted',
}

export function TestPayments({ state }: { state: TestState }) {
  const toast = useToast()
  const [pending, setPending] = React.useState<'stripe' | 'cregis' | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function start(processor: 'stripe' | 'cregis') {
    setError(null)

    const confirmed = window.confirm(
      `Start a live $1 ${processor === 'stripe' ? 'card' : 'crypto'} payment?\n\n` +
        `This is real money, in live mode, charged to you — not a sandbox. It creates no ` +
        `membership and sends no email. Refund it from the ${
          processor === 'stripe' ? 'Stripe' : 'Cregis'
        } dashboard when you are done.`,
    )
    if (!confirmed) return

    setPending(processor)
    try {
      const response = await fetch('/api/admin/payments/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ processor }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok || !data?.checkoutUrl) {
        // The failure *is* the finding — this is a diagnostic, so the processor's own
        // words are shown rather than a friendly summary that hides the cause.
        const message = data?.error ?? `Could not start the test (HTTP ${response.status}).`
        setError(message)
        toast('Test could not be started', 'error')
        return
      }

      window.location.href = data.checkoutUrl
    } catch {
      setError('Could not reach the server.')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={!state.stripeReady || pending !== null}
          onClick={() => start('stripe')}
        >
          {pending === 'stripe' ? <Spinner /> : <CreditCard className="h-4 w-4" aria-hidden />}
          Test $1 by card
        </Button>
        <Button
          variant="secondary"
          disabled={!state.cregisReady || pending !== null}
          onClick={() => start('cregis')}
        >
          {pending === 'cregis' ? <Spinner /> : <Bitcoin className="h-4 w-4" aria-hidden />}
          Test $1 in crypto
        </Button>
      </div>

      {(!state.stripeReady || !state.cregisReady) && (
        <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
          {!state.stripeReady && !state.cregisReady
            ? 'Neither processor is configured yet, so there is nothing to test.'
            : `${!state.stripeReady ? 'Stripe' : 'Cregis'} is not configured yet, so that test is unavailable.`}
        </p>
      )}

      <p className="mt-4 text-[13px] leading-relaxed text-ink-dim">
        Real money, live mode, charged to <span className="text-ink">{state.adminEmail}</span>. It
        creates no membership, issues no code and sends no email — refund it from the processor
        when you are done. The card test is a one-off charge, not a subscription, so it proves
        checkout, settlement and the webhook, but not the monthly renewal, which only a real
        subscription exercises.
      </p>

      {error && (
        <p role="alert" className="mt-3 break-words text-[13px] leading-relaxed text-down">
          {error}
        </p>
      )}

      {state.recent.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim">
            Recent tests
          </h3>
          <ul className="overflow-hidden rounded-lg border border-line">
            {state.recent.map((test) => (
              <li
                key={test.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-panel-2 px-4 py-2.5 last:border-b-0"
              >
                <span className="font-mono text-[12px] capitalize text-ink-dim">
                  {test.provider} · ${test.amount} · {test.when}
                </span>
                <Badge tone={TONE[test.status] ?? 'muted'}>{test.status}</Badge>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">
            A row that reaches <span className="text-ink">paid</span> is the proof: the money
            arrived and the processor&rsquo;s callback reached this app with a valid signature. One
            stuck at <span className="text-ink">pending</span> after you have paid means the
            callback is not arriving — check the webhook URL below.
          </p>
        </>
      )}
    </div>
  )
}
