'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { CODE_VALIDITY_DAYS, MAX_CODE_VALIDITY_DAYS } from '@/lib/codes'

/**
 * Operator-facing code minting. Deliberately few fields — this is used by whoever runs
 * the business, not by a developer.
 *
 * The discount is a **label**, not a price. Every code unlocks the same membership period
 * whatever it says; a discounted sale is settled off-system however the operator settled
 * it. The field exists so a batch can be read back later as "the 50% launch offer" rather
 * than as an undifferentiated pile of comps, and the copy says so plainly, because a
 * percentage next to a button is otherwise a fair thing to mistake for pricing.
 */
export function CodeGenerator() {
  const router = useRouter()
  const [count, setCount] = React.useState(5)
  const [note, setNote] = React.useState('')
  // 100% — a free code — is what an operator wants nine times out of ten.
  const [discountPercent, setDiscountPercent] = React.useState(100)
  /*
   * Held as a string, not a number.
   *
   * It used to be a number clamped on every keystroke with `Number(value) || 1`, which
   * meant the field could not be emptied: clearing it snapped to "1", so typing 9 next
   * produced 19 and typing 30 produced 130. Every number the operator entered silently
   * gained a leading 1, and the field looked like it had a maximum of 19 days.
   *
   * A string lets it be empty while somebody is mid-type. It is clamped once, on submit,
   * where clamping is actually meaningful.
   */
  const [validityText, setValidityText] = React.useState(String(CODE_VALIDITY_DAYS))
  // Separate from the days field rather than encoded as 0 or a huge number: an unlimited
  // code should be something the operator decided, not something they typed.
  const [neverExpires, setNeverExpires] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [codes, setCodes] = React.useState<string[]>([])
  const [error, setError] = React.useState('')
  const [copied, setCopied] = React.useState(false)

  /** What the field currently means, once. Empty or nonsense falls back to the default. */
  function validityDays(): number {
    const parsed = Number.parseInt(validityText, 10)
    if (!Number.isFinite(parsed) || parsed < 1) return CODE_VALIDITY_DAYS
    return Math.min(MAX_CODE_VALIDITY_DAYS, parsed)
  }

  async function create() {
    setBusy(true)
    setError('')
    setCodes([])

    try {
      const response = await fetch('/api/admin/codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count,
          note: note.trim() || undefined,
          discountPercent,
          validityDays: neverExpires ? null : validityDays(),
        }),
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
        Each code lets one person activate a membership without paying here. Redeeming it gives
        them one month from the day they use it. Set how long the code itself stays usable —{' '}
        {CODE_VALIDITY_DAYS} days unless you change it.
      </p>

      <div className="mt-5 grid grid-cols-2 items-end gap-4 sm:flex sm:flex-wrap">
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
            className="w-full sm:w-24"
          />
        </div>

        <div>
          <Label htmlFor="discount">Discount</Label>
          <select
            id="discount"
            value={discountPercent}
            onChange={(event) => setDiscountPercent(Number(event.target.value))}
            className="h-11 w-full rounded-lg sm:w-36 border border-line bg-panel-2 px-3 text-[15px] text-ink"
          >
            <option value={100}>100% — free</option>
            <option value={75}>75% off</option>
            <option value={50}>50% off</option>
            <option value={25}>25% off</option>
            <option value={0}>Full price</option>
          </select>
        </div>

        <div>
          <Label htmlFor="validity">Valid for</Label>
          <div className="flex items-center gap-2">
            <Input
              id="validity"
              type="number"
              min={1}
              max={MAX_CODE_VALIDITY_DAYS}
              value={neverExpires ? '' : validityText}
              disabled={neverExpires}
              placeholder="—"
              // Accepted as typed, including empty. Clamped on submit, not per keystroke.
              onChange={(event) => setValidityText(event.target.value)}
              className="w-full sm:w-20"
            />
            <span className="shrink-0 text-[14px] text-ink-dim">days</span>
          </div>
        </div>

        <div className="col-span-2 min-w-[220px] flex-1">
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

        <Button onClick={create} disabled={busy} className="col-span-2 w-full sm:w-auto">
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

      <label className="mt-4 flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={neverExpires}
          onChange={(event) => setNeverExpires(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#D0F53C]"
        />
        <span className="text-[14px] leading-relaxed text-ink-dim">
          <span className="text-ink">Never expires.</span> The code works until it is used. Worth
          knowing: an unused code with no expiry is an open-ended membership sitting in somebody
          else&rsquo;s inbox.
        </span>
      </label>

      {/* Said next to the control, not only in a doc comment: a percentage beside a
          "create" button is otherwise a fair thing to read as pricing. */}
      <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
        The discount is a label for your own records — it does not change what anyone is
        charged. Every code unlocks the same membership when it is redeemed.
      </p>

      {error ? <p className="mt-4 text-[14px] text-down">{error}</p> : null}

      {codes.length > 0 ? (
        <div className="mt-6 rounded-lg border border-accent/30 bg-accent/[0.06] p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="eyebrow">
              {codes.length} code{codes.length === 1 ? '' : 's'} ready to share ·{' '}
              {neverExpires ? 'no expiry' : `valid ${validityDays()} days`}
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
