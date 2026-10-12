'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label, Select } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

export function AffiliateLink({ link }: { link: string }) {
  const toast = useToast()
  const [copied, setCopied] = React.useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Copy failed — select the link and copy it by hand.', 'error')
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <code className="min-w-0 flex-1 break-all rounded-lg border border-line bg-panel-2 px-4 py-3 font-mono text-[14px] text-ink">
        {link}
      </code>
      <Button variant="secondary" onClick={copy} className="shrink-0">
        {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
        {copied ? 'Copied' : 'Copy link'}
      </Button>
    </div>
  )
}

/**
 * Ask for a withdrawal. Asking moves nothing: the request waits for an operator to approve
 * it and send it, and the page says so, so nobody watches their bank for money not yet sent.
 */
export function WithdrawalForm({
  availableCents,
  endpoint = '/api/affiliate/withdrawals',
  saved = null,
}: {
  availableCents: number
  /** The signed-in member's own withdrawal route: affiliate or expert. */
  endpoint?: string
  /** Their saved payout details, masked, if they have any. Used unless they type another. */
  saved?: string | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [elsewhere, setElsewhere] = React.useState(false)
  const typed = !saved || elsewhere

  if (availableCents <= 0) {
    return (
      <p className="mt-6 border-t border-line pt-5 text-[15px] text-ink-dim">
        Nothing is available to withdraw yet.
      </p>
    )
  }

  return (
    <form
      className="mt-6 border-t border-line pt-5"
      noValidate
      onSubmit={async (event) => {
        event.preventDefault()
        const form = event.currentTarget
        const data = new FormData(form)
        const amount = Number(data.get('amount') ?? 0)
        setError(null)
        if (!(amount > 0)) {
          setError('Enter an amount greater than zero.')
          return
        }
        const destination = typed ? String(data.get('destination') ?? '').trim() : ''
        if (typed && !destination) {
          setError('Say where the money should go.')
          return
        }
        setPending(true)
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amountCents: Math.round(amount * 100),
              destination: destination || undefined,
              note: String(data.get('note') ?? '') || undefined,
            }),
          })
          const body = await response.json().catch(() => ({}))
          if (!response.ok) {
            setError(body.error ?? 'That request could not be sent.')
            return
          }
          form.reset()
          toast('Withdrawal requested', 'success')
          router.refresh()
        } catch {
          setError('That request could not be sent.')
        } finally {
          setPending(false)
        }
      }}
    >
      <h3 className="text-[17px] text-ink">Ask for a withdrawal</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-[10rem_1fr]">
        <div>
          <Label htmlFor="amount">Amount (USD)</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            min={0.01}
            step={0.01}
            max={availableCents / 100}
            defaultValue={(availableCents / 100).toFixed(2)}
          />
        </div>
        {typed ? (
          <div>
            <Label htmlFor="destination">Send it to</Label>
            <Input id="destination" name="destination" placeholder="Wallet address and network, or bank details" />
            <Hint>
              Check it carefully — a payment sent to the wrong place cannot be pulled back.
              {saved && (
                <>
                  {' '}
                  <button type="button" className="text-accent-ink underline underline-offset-4" onClick={() => setElsewhere(false)}>
                    Use my saved details
                  </button>
                </>
              )}
            </Hint>
          </div>
        ) : (
          <div>
            <Label>Send it to</Label>
            <p className="rounded-lg border border-line bg-panel-2 px-4 py-2.5 font-mono text-[14px] text-ink">{saved}</p>
            <Hint>
              Your saved payout details.{' '}
              <button type="button" className="text-accent-ink underline underline-offset-4" onClick={() => setElsewhere(true)}>
                Send this one somewhere else
              </button>
            </Hint>
          </div>
        )}
      </div>
      <div className="mt-4">
        <Label htmlFor="note">Note (optional)</Label>
        <Input id="note" name="note" />
      </div>
      <FieldError>{error}</FieldError>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Spinner />
              Sending…
            </>
          ) : (
            'Request withdrawal'
          )}
        </Button>
        <span className="text-[14px] text-ink-dim">We approve each request by hand before anything is sent.</span>
      </div>
    </form>
  )
}

const METHOD_OPTIONS = [
  { value: 'bank', label: 'Bank transfer' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'wise', label: 'Wise' },
  { value: 'crypto', label: 'Crypto wallet' },
] as const

/**
 * Where withdrawals go, saved once. The current details are shown masked; changing them
 * means typing them in full again, so nothing on the page can be copied back out. Every
 * change is emailed to the account owner.
 */
export function PayoutDetailsForm({
  endpoint,
  current,
}: {
  /** The signed-in member's own route: /api/affiliate/payout-details or /api/expert/payout-details. */
  endpoint: string
  /** Masked summary of what is saved now, and when it last changed. */
  current: { summary: string; holderName: string; method: string; updatedAt: string } | null
}) {
  const router = useRouter()
  const toast = useToast()
  const [editing, setEditing] = React.useState(!current)
  const [method, setMethod] = React.useState<string>(current?.method ?? 'bank')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  if (!editing && current) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[15px] text-ink">{current.summary}</p>
          <p className="mt-1 text-[14px] text-ink-dim">
            In the name of {current.holderName} · changed {current.updatedAt}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
          Change
        </Button>
      </div>
    )
  }

  const accountLabel =
    method === 'bank' ? 'IBAN or account number' : method === 'crypto' ? 'Wallet address' : `${method === 'wise' ? 'Wise' : 'PayPal'} email`
  const routingLabel = method === 'bank' ? 'SWIFT / BIC (optional)' : 'Coin and network'

  return (
    <form
      noValidate
      onSubmit={async (event) => {
        event.preventDefault()
        const data = new FormData(event.currentTarget)
        setError(null)
        setPending(true)
        try {
          const response = await fetch(endpoint, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              method,
              holderName: String(data.get('holderName') ?? ''),
              account: String(data.get('account') ?? ''),
              routing: String(data.get('routing') ?? '') || undefined,
              bankName: String(data.get('bankName') ?? '') || undefined,
            }),
          })
          const body = await response.json().catch(() => ({}))
          if (!response.ok) {
            setError(body.error ?? 'Those details could not be saved.')
            return
          }
          toast(body.alerted ? 'Saved — we have emailed you to confirm the change' : 'Payout details saved', 'success')
          setEditing(false)
          router.refresh()
        } catch {
          setError('Those details could not be saved.')
        } finally {
          setPending(false)
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="payout-method">Paid by</Label>
          <Select id="payout-method" value={method} onChange={(event) => setMethod(event.target.value)}>
            {METHOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="payout-holder">Name on the account</Label>
          <Input id="payout-holder" name="holderName" autoComplete="name" defaultValue={current?.holderName ?? ''} />
        </div>
        <div className={method === 'paypal' || method === 'wise' ? 'sm:col-span-2' : ''}>
          <Label htmlFor="payout-account">{accountLabel}</Label>
          <Input
            id="payout-account"
            name="account"
            type={method === 'paypal' || method === 'wise' ? 'email' : 'text'}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        </div>
        {(method === 'bank' || method === 'crypto') && (
          <div>
            <Label htmlFor="payout-routing">{routingLabel}</Label>
            <Input
              id="payout-routing"
              name="routing"
              autoComplete="off"
              spellCheck={false}
              placeholder={method === 'crypto' ? 'USDT on TRON (TRC-20)' : undefined}
            />
          </div>
        )}
        {method === 'bank' && (
          <div className="sm:col-span-2">
            <Label htmlFor="payout-bank">Bank name (optional)</Label>
            <Input id="payout-bank" name="bankName" />
          </div>
        )}
      </div>
      <FieldError>{error}</FieldError>
      <div className="mt-5 flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Spinner />
              Saving…
            </>
          ) : (
            'Save payout details'
          )}
        </Button>
        {current && (
          <button type="button" className="text-[14px] text-ink-dim hover:text-ink" onClick={() => setEditing(false)}>
            Cancel
          </button>
        )}
        <span className="text-[14px] text-ink-dim">We email you whenever these change.</span>
      </div>
    </form>
  )
}

/**
 * Build a tracked link to any public page, with an optional campaign tag, so an affiliate
 * can see which of their posts or videos sends people. Built in the browser from the same
 * rules the server applies — the tag is cleaned the way the middleware will clean it.
 */
export function LinkBuilder({ base, slug, pages }: { base: string; slug: string; pages: { path: string; label: string }[] }) {
  const [path, setPath] = React.useState(pages[0]?.path ?? '/join')
  const [tag, setTag] = React.useState('')
  const clean = tag
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const link = `${base.replace(/\/$/, '')}${path}?ref=${encodeURIComponent(slug)}${clean ? `&c=${encodeURIComponent(clean)}` : ''}`

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="link-page">Page</Label>
          <select
            id="link-page"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            className="mt-2 h-11 w-full rounded-lg border border-line bg-panel-2 px-3 text-[15px] text-ink focus:border-accent/60 focus:outline-none focus:ring-2 focus:ring-accent/40"
          >
            {pages.map((page) => (
              <option key={page.path} value={page.path}>
                {page.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="link-tag">Campaign tag (optional)</Label>
          <Input id="link-tag" value={tag} onChange={(event) => setTag(event.target.value)} placeholder="youtube-may" maxLength={60} className="mt-2" />
          <Hint>Letters, numbers and dashes. Shows up in your campaign table.</Hint>
        </div>
      </div>
      <div className="mt-5">
        <AffiliateLink link={link} />
      </div>
    </div>
  )
}
