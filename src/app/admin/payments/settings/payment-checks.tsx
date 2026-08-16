'use client'

import * as React from 'react'
import { AlertTriangle, Check, Copy, RefreshCw, X } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type CheckResult = { label: string; status: 'ok' | 'warn' | 'fail'; detail: string }

/**
 * Runs the live checks against Stripe on demand rather than on page load.
 *
 * On load would mean an outbound API call every time an admin opens the page — including
 * the times they came here to read a webhook URL — and a Stripe outage would make the
 * settings page itself appear broken. It is a deliberate action with a visible result.
 */
export function PaymentChecks() {
  const toast = useToast()
  const [running, setRunning] = React.useState(false)
  const [results, setResults] = React.useState<{ stripe: CheckResult[]; cregis: CheckResult[] } | null>(
    null,
  )

  async function run() {
    setRunning(true)
    try {
      const response = await fetch('/api/admin/payments/check', { method: 'POST' })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        toast(data?.error ?? 'The checks could not be run.', 'error')
        return
      }
      setResults(data)
    } catch {
      toast('The checks could not be run.', 'error')
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={run} disabled={running}>
          {running ? (
            <>
              <Spinner />
              Checking…
            </>
          ) : (
            <>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Run checks
            </>
          )}
        </Button>
        <p className="text-[13px] text-ink-dim">
          Read-only. Retrieves your price and webhook list — creates no charge or order.
        </p>
      </div>

      {results && (
        <div className="mt-6 space-y-6">
          <CheckGroup title="Stripe" results={results.stripe} />
          <CheckGroup title="Cregis" results={results.cregis} />
        </div>
      )}
    </div>
  )
}

function CheckGroup({ title, results }: { title: string; results: CheckResult[] }) {
  return (
    <div>
      <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim">{title}</h3>
      <ul className="space-y-2">
        {results.map((result, index) => (
          <li
            key={`${result.label}-${index}`}
            className={cn(
              'flex items-start gap-2.5 rounded-lg border p-3.5',
              result.status === 'ok' && 'border-line bg-panel',
              result.status === 'warn' && 'border-accent/30 bg-accent/5',
              result.status === 'fail' && 'border-down/40 bg-down/10',
            )}
          >
            <StatusIcon status={result.status} />
            <div className="min-w-0">
              <p className="text-[14px] text-ink">{result.label}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-dim">{result.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatusIcon({ status }: { status: CheckResult['status'] }) {
  if (status === 'ok') return <Check className="mt-0.5 h-4 w-4 shrink-0 text-up" aria-hidden />
  if (status === 'warn')
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
  return <X className="mt-0.5 h-4 w-4 shrink-0 text-down" aria-hidden />
}

/**
 * A URL to paste into a processor's dashboard.
 *
 * Copyable because these are retyped by hand otherwise, and a webhook URL with a typo in
 * it fails silently — the processor reports the payment as successful and this app never
 * hears about it.
 */
export function CopyableUrl({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false)

  return (
    <div className="flex items-start justify-between gap-3 border-b border-line py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">{label}</p>
        <p className="mt-1 break-all font-mono text-[12px] text-ink">{value}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          } catch {
            // Clipboard access can be refused; the text is on screen and selectable.
          }
        }}
        className="shrink-0 rounded border border-line px-2.5 py-1.5 font-mono text-[11px] text-ink-dim transition-colors hover:text-ink"
      >
        {copied ? (
          <Check className="h-3 w-3 text-up" aria-hidden />
        ) : (
          <Copy className="h-3 w-3" aria-hidden />
        )}
        <span className="sr-only">Copy {label}</span>
      </button>
    </div>
  )
}
