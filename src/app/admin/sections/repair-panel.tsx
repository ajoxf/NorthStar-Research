'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Wrench } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'

type Report = {
  dryRun: boolean
  itemsCreated: number
  itemsRenamed: number
  sectionsLinked: number
  entitlementsLinked: number
  entitlementsUnresolved: number
  warnings: string[]
  clean: boolean
}

/**
 * Repair sections that cannot be put in a package.
 *
 * A section is sold through an item, and a section created before that was wired up has
 * none — so it can be priced and shown and never bundled or trialled. This finds them and
 * links them.
 *
 * **Check, then apply**, never one button that does both. This writes to live data, and a
 * repair somebody set off without first seeing what it would touch is not a repair they
 * chose. The check writes nothing, so it is safe to press at any time — which is also what
 * makes it useful as a plain answer to "is anything broken?".
 */
export function RepairPanel({ unlinked }: { unlinked: number }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = React.useState<'check' | 'apply' | null>(null)
  const [report, setReport] = React.useState<Report | null>(null)

  async function run(dryRun: boolean) {
    setBusy(dryRun ? 'check' : 'apply')
    try {
      const response = await fetch('/api/admin/sections/repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast(data?.error ?? `The repair failed (HTTP ${response.status}).`, 'error')
        return
      }
      setReport(data)
      if (!dryRun) {
        toast(data.clean ? 'Nothing needed repairing' : 'Sections repaired', 'success')
        router.refresh()
      }
    } catch {
      toast('Could not reach the server.', 'error')
    } finally {
      setBusy(null)
    }
  }

  /*
   * Hidden when there is nothing wrong and nobody has asked.
   *
   * A maintenance button on a healthy screen is an invitation to press it and an
   * implication that something needs doing. `unlinked` is counted server-side, so this
   * appears exactly when it is true.
   */
  if (unlinked === 0 && report === null) return null

  return (
    <div className="mb-8 rounded-lg border border-accent/30 bg-accent/[0.06] p-5">
      <h2 className="text-[15px] text-ink">
        {unlinked > 0
          ? `${unlinked} section${unlinked === 1 ? '' : 's'} cannot be put in a package`
          : 'Repair sections'}
      </h2>
      <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink-dim">
        A section is sold through a grantable item. Sections created before that was wired
        up have none, so they can be priced and shown but never bundled into a package or
        offered on trial. This links them, and points any older subscriber records at the
        right item.
      </p>
      <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-ink-dim">
        Nothing is deleted and nobody&rsquo;s access changes. Check first — that writes
        nothing — then apply. Running it twice is harmless.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" disabled={busy !== null} onClick={() => run(true)}>
          {busy === 'check' ? <Spinner /> : <Wrench className="h-3.5 w-3.5" aria-hidden />}
          {busy === 'check' ? 'Checking…' : 'Check what needs repairing'}
        </Button>

        {/* Only offered once a check has been read, and only when it found something. */}
        {report?.dryRun && !report.clean && (
          <Button
            disabled={busy !== null}
            onClick={() => {
              if (!confirm('Apply these repairs? Nothing is deleted and no access changes.')) return
              void run(false)
            }}
          >
            {busy === 'apply' && <Spinner />}
            Apply the repairs
          </Button>
        )}
      </div>

      {report && (
        <div className="mt-4 rounded-lg border border-line bg-panel p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
            {report.dryRun ? 'Would change' : 'Changed'}
          </p>

          {report.clean ? (
            <p className="mt-2 text-[14px] text-ink">
              Nothing — every section already has its item.
            </p>
          ) : (
            <dl className="mt-2 grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {[
                ['Items created', report.itemsCreated],
                ['Items renamed', report.itemsRenamed],
                ['Sections linked', report.sectionsLinked],
                ['Subscriber records linked', report.entitlementsLinked],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex justify-between gap-4 text-[14px]">
                  <dt className="text-ink-dim">{label}</dt>
                  <dd className="font-mono text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {!report.dryRun && report.entitlementsUnresolved > 0 && (
            <p className="mt-3 text-[13px] leading-relaxed text-down">
              {report.entitlementsUnresolved} subscriber record
              {report.entitlementsUnresolved === 1 ? '' : 's'} still could not be matched to an
              item. Nobody has lost access — but this one needs a person to look at it.
            </p>
          )}

          {report.warnings.length > 0 && (
            <ul className="mt-3 space-y-1">
              {report.warnings.map((warning) => (
                <li key={warning} className="text-[13px] leading-relaxed text-ink-dim">
                  {warning}
                </li>
              ))}
            </ul>
          )}

          {report.dryRun && !report.clean && (
            <p className="mt-3 text-[13px] text-ink-dim">
              Nothing has been written yet.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
