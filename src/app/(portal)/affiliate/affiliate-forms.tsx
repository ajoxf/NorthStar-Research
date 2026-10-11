'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label } from '@/components/ui/field'
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
}: {
  availableCents: number
  /** The signed-in member's own withdrawal route: affiliate or expert. */
  endpoint?: string
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

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
        setPending(true)
        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amountCents: Math.round(amount * 100),
              destination: String(data.get('destination') ?? ''),
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
        <div>
          <Label htmlFor="destination">Send it to</Label>
          <Input id="destination" name="destination" placeholder="Wallet address and network, or bank details" />
          <Hint>Check it carefully — a payment sent to the wrong place cannot be pulled back.</Hint>
        </div>
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
