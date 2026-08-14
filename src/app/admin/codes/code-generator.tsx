'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'

/**
 * Operator-facing code minting. Deliberately two fields and one button — this is used by
 * whoever runs the business, not by a developer.
 */
export function CodeGenerator() {
  const router = useRouter()
  const [count, setCount] = React.useState(5)
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [codes, setCodes] = React.useState<string[]>([])
  const [error, setError] = React.useState('')
  const [copied, setCopied] = React.useState(false)

  async function create() {
    setBusy(true)
    setError('')
    setCodes([])

    try {
      const response = await fetch('/api/admin/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, note: note.trim() || undefined }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'Could not create the codes.')
        // A partial batch still returns the codes that were made — show them rather
        // than losing them behind an error message.
        if (Array.isArray(data.codes)) setCodes(data.codes)
      } else {
        setCodes(data.codes)
        router.refresh()
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel p-6">
      <h2 className="font-display text-lg text-ink">Create access codes</h2>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-dim">
        Each code lets one person activate a membership without paying. Redeeming it gives them
        one month from the day they use it. Codes do not expire on their own — to stop an offer,
        simply stop handing them out.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <div>
          <Label htmlFor="count">How many</Label>
          <Input
            id="count"
            type="number"
            min={1}
            max={50}
            value={count}
            onChange={(event) =>
              setCount(Math.max(1, Math.min(50, Number(event.target.value) || 1)))
            }
            className="w-24"
          />
        </div>

        <div className="min-w-[220px] flex-1">
          <Label htmlFor="note">What for (optional)</Label>
          <Input
            id="note"
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Friends &amp; family, August"
            maxLength={120}
          />
        </div>

        <Button onClick={create} disabled={busy}>
          {busy ? (
            <>
              <Spinner />
              Creating…
            </>
          ) : (
            `Create ${count} code${count === 1 ? '' : 's'}`
          )}
        </Button>
      </div>

      {error ? <p className="mt-4 text-[14px] text-down">{error}</p> : null}

      {codes.length > 0 ? (
        <div className="mt-6 rounded-lg border border-accent/30 bg-accent/[0.06] p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="eyebrow">
              {codes.length} code{codes.length === 1 ? '' : 's'} ready to share
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                navigator.clipboard.writeText(codes.join('\n'))
                setCopied(true)
                setTimeout(() => setCopied(false), 2000)
              }}
            >
              {copied ? 'Copied' : 'Copy all'}
            </Button>
          </div>

          <ul className="mt-3 grid gap-1 font-mono text-[15px] text-ink sm:grid-cols-2 lg:grid-cols-3">
            {codes.map((code) => (
              <li key={code}>{code}</li>
            ))}
          </ul>

          <p className="mt-3 text-[13px] text-ink-dim">
            Send each person one code and the link to <span className="text-ink">/redeem</span>.
            They are listed in the table below too, so nothing is lost if you navigate away.
          </p>
        </div>
      ) : null}
    </div>
  )
}
