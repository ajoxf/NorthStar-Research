'use client'

import * as React from 'react'
import { ArrowRight, Bitcoin, CreditCard } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { cn, isValidEmail } from '@/lib/utils'

type Method = 'card' | 'crypto'

/**
 * Both payment paths, side by side.
 *
 * They are genuinely different products, so the difference is stated plainly rather than
 * hidden: card subscriptions renew themselves, crypto ones cannot and must be renewed by
 * hand each month. Letting someone pick crypto while assuming it auto-renews would just
 * produce a lapsed membership and a support ticket.
 */
export function JoinForm({
  cardReady,
  cryptoReady,
}: {
  cardReady: boolean
  cryptoReady: boolean
}) {
  const toast = useToast()
  const [method, setMethod] = React.useState<Method>(cardReady ? 'card' : 'crypto')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const ready = method === 'card' ? cardReady : cryptoReady

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!isValidEmail(email)) {
      setError('Enter the email address where you want your access code sent.')
      return
    }

    setPending(true)
    try {
      const endpoint = method === 'card' ? '/api/checkout/stripe' : '/api/checkout/create'
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, phoneNumber: phone || undefined }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'Checkout could not be started. Please try again.')
        toast(data.error ?? 'Checkout could not be started.', 'error')
        return
      }

      toast('Redirecting to secure payment…', 'info')
      window.location.href = data.checkoutUrl
    } catch {
      setError('We could not reach the payment service. Please try again.')
      toast('We could not reach the payment service.', 'error')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment method">
        <MethodOption
          icon={CreditCard}
          label="Card"
          detail="Renews monthly"
          selected={method === 'card'}
          onSelect={() => setMethod('card')}
        />
        <MethodOption
          icon={Bitcoin}
          label="Crypto"
          detail="Renew manually"
          selected={method === 'crypto'}
          onSelect={() => setMethod('crypto')}
        />
      </div>

      {!ready && (
        <div className="mb-5 rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-[13px] leading-relaxed text-ink">
          <strong className="font-medium">
            {method === 'card' ? 'Card payments' : 'Crypto payments'} are not live yet.
          </strong>{' '}
          Those credentials have not been configured for this deployment, so this option cannot take
          a payment. {method === 'card' && cryptoReady && 'Crypto is available in the meantime.'}
          {method === 'crypto' && cardReady && 'Card payment is available in the meantime.'}
        </div>
      )}

      <div className="mb-4">
        <Label htmlFor="email">Email for your access code</Label>
        <Input
          id="email"
          type="email"
          value={email}
          autoComplete="email"
          placeholder="you@example.com"
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(error)}
          required
        />
        <FieldError>{error}</FieldError>
      </div>

      {method === 'crypto' && (
        <div className="mb-6 animate-fade-up">
          <Label htmlFor="phone">Phone number — optional</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            autoComplete="tel"
            placeholder="+1 555 000 0000"
            onChange={(event) => setPhone(event.target.value)}
          />
          <Hint>Only used if you want your report links on WhatsApp. You can add it later.</Hint>
        </div>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending || !ready}>
        {pending ? (
          <>
            <Spinner />
            Starting checkout…
          </>
        ) : (
          <>
            {method === 'card' ? 'Subscribe — $199/month' : 'Pay $199 in crypto'}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </>
        )}
      </Button>

      <p className="mt-4 text-center text-[12px] leading-relaxed text-ink-dim">
        {method === 'card'
          ? 'Billed monthly. Cancel any time from your account. NorthStar Research never sees your card details.'
          : 'One month of access per payment. Crypto cannot renew automatically, so we will remind you before it ends.'}
      </p>
    </form>
  )
}

function MethodOption({
  icon: Icon,
  label,
  detail,
  selected,
  onSelect,
}: {
  icon: typeof CreditCard
  label: string
  detail: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex flex-col items-start gap-1 rounded-lg border p-3.5 text-left transition-colors',
        selected
          ? 'border-accent/60 bg-accent/10'
          : 'border-line bg-panel-2 hover:border-ink-dim/40',
      )}
    >
      <Icon className={cn('h-4 w-4', selected ? 'text-accent' : 'text-ink-dim')} aria-hidden />
      <span className="text-[14px] text-ink">{label}</span>
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-dim">{detail}</span>
    </button>
  )
}
