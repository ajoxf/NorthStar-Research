'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, Send } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { Hint, Input, Label } from '@/components/ui/field'

/**
 * Send one real welcome email and show what the provider said.
 *
 * The result panel is the feature. A green tick is worth little on its own — what makes
 * this useful is that a failure arrives as the provider's own sentence, which names
 * which of several identical-looking causes this actually is.
 */
type Result = {
  ok: boolean
  provider: string
  from: string
  messageId?: string | null
  error?: string
}

export function EmailTest({ defaultTo }: { defaultTo: string }) {
  const router = useRouter()
  const [to, setTo] = React.useState(defaultTo)
  const [pending, setPending] = React.useState(false)
  const [result, setResult] = React.useState<Result | null>(null)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setResult(null)

    try {
      const response = await fetch('/api/admin/emails/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to }),
      })
      const data = await response.json().catch(() => null)

      if (!data) {
        setResult({ ok: false, provider: '—', from: '—', error: `The server answered ${response.status} with no body.` })
        return
      }

      setResult(data as Result)
      // The attempt is recorded either way, so the log below should show it immediately.
      router.refresh()
    } catch {
      setResult({ ok: false, provider: '—', from: '—', error: 'Could not reach the server.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <form onSubmit={handleSubmit} noValidate>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <Label htmlFor="test-to">Send a real welcome email to</Label>
            <Input
              id="test-to"
              type="email"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="you@example.com"
              autoComplete="off"
              required
            />
          </div>
          <Button type="submit" disabled={pending || !to}>
            {pending ? <Spinner /> : <Send className="h-4 w-4" aria-hidden />}
            {pending ? 'Sending…' : 'Send test'}
          </Button>
        </div>
        <Hint>
          The same welcome email a new member gets, through whatever provider is live. Try an
          address on a different domain from your own — a provider in test mode will deliver to
          the account owner and silently refuse everyone else, which looks exactly like this
          working.
        </Hint>
      </form>

      {result && (
        <div
          className={`mt-4 flex items-start gap-2 rounded-lg border p-4 text-[13px] leading-relaxed ${
            result.ok ? 'border-up/35 bg-up/10 text-ink' : 'border-down/35 bg-down/10 text-ink'
          }`}
        >
          {result.ok ? (
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-up" aria-hidden />
          ) : (
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-down" aria-hidden />
          )}
          <div className="min-w-0">
            {result.ok ? (
              <>
                <strong className="font-medium">
                  {result.provider} accepted it from {result.from}.
                </strong>{' '}
                If it does not arrive, it was accepted and then dropped or filtered — check the
                provider&rsquo;s own dashboard for that message, then the spam folder.
                {result.messageId && (
                  <span className="mt-1 block break-all font-mono text-[12px] text-ink-dim">
                    {result.messageId}
                  </span>
                )}
              </>
            ) : (
              <>
                <strong className="font-medium">Not sent.</strong>{' '}
                {/* Verbatim. This sentence is the diagnosis. */}
                <span className="break-words">{result.error}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
