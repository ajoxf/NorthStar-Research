'use client'

import * as React from 'react'
import { ArrowRight, Bitcoin, Check, CreditCard } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { formatPrice } from '@/lib/package-shape'
import { cn, isValidEmail } from '@/lib/utils'

type Method = 'card' | 'crypto'

export type JoinPackage = {
  id: string
  name: string
  description: string | null
  priceCents: number
  currency: string
  interval: string
  features: string[]
  /** False when the package carries no Stripe price, so card checkout cannot sell it. */
  cardAvailable: boolean
}

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
  packages,
  selectedId,
}: {
  cardReady: boolean
  cryptoReady: boolean
  packages: JoinPackage[]
  selectedId: string
}) {
  const toast = useToast()
  const [method, setMethod] = React.useState<Method>(cardReady ? 'card' : 'crypto')
  const [packageId, setPackageId] = React.useState(selectedId)
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const chosen = packages.find((pkg) => pkg.id === packageId) ?? packages[0]
  const price = formatPrice(chosen.priceCents, chosen.currency)

  // A package with no Stripe price cannot be billed by card, whatever Stripe's own
  // configuration says. Disabling the option here is the honest version of a checkout
  // that would otherwise be refused after the buyer had committed to it.
  const ready = method === 'card' ? cardReady && chosen.cardAvailable : cryptoReady

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
        body: JSON.stringify({ email, phoneNumber: phone || undefined, packageId: chosen.id }),
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
      {packages.length > 1 && (
        <div className="mb-5 grid gap-2" role="radiogroup" aria-label="Membership">
          {packages.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              role="radio"
              aria-checked={pkg.id === chosen.id}
              onClick={() => setPackageId(pkg.id)}
              className={cn(
                'flex items-start justify-between gap-3 rounded-lg border p-3.5 text-left transition-colors',
                pkg.id === chosen.id
                  ? 'border-accent/60 bg-accent/10'
                  : 'border-line bg-panel-2 hover:border-ink-dim/40',
              )}
            >
              <span className="min-w-0">
                <span className="block text-[14px] text-ink">{pkg.name}</span>
                {pkg.description && (
                  <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-dim">
                    {pkg.description}
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[13px] text-ink">
                {formatPrice(pkg.priceCents, pkg.currency)}
                <span className="text-ink-dim">/{pkg.interval === 'year' ? 'yr' : 'mo'}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mb-6 flex items-baseline gap-2 border-b border-line pb-6">
        <span className="font-display text-4xl text-ink">{price}</span>
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim">
          per {chosen.interval}
        </span>
      </div>

      {chosen.features.length > 0 && (
        <ul className="mb-6 space-y-2.5">
          {chosen.features.map((feature) => (
            <li key={feature} className="flex items-center gap-2.5 text-[14px] text-ink-dim">
              <Check className="h-3.5 w-3.5 shrink-0 text-up" aria-hidden />
              {feature}
            </li>
          ))}
        </ul>
      )}

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
          {method === 'card' && cardReady && !chosen.cardAvailable ? (
            <>
              <strong className="font-medium">{chosen.name} cannot be paid by card.</strong> This
              membership is set up for crypto only.{' '}
              {cryptoReady && 'Choose crypto above, or pick another membership.'}
            </>
          ) : (
            <>
              <strong className="font-medium">
                {method === 'card' ? 'Card payments' : 'Crypto payments'} are not live yet.
              </strong>{' '}
              Those credentials have not been configured for this deployment, so this option cannot
              take a payment.{' '}
              {method === 'card' && cryptoReady && 'Crypto is available in the meantime.'}
              {method === 'crypto' && cardReady && 'Card payment is available in the meantime.'}
            </>
          )}
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
          <Hint>So the desk can reach you about your order. You can add it later.</Hint>
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
            {method === 'card'
              ? `Subscribe — ${price}/${chosen.interval}`
              : `Pay ${price} in crypto`}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </>
        )}
      </Button>

      <p className="mt-4 text-center text-[12px] leading-relaxed text-ink-dim">
        {method === 'card'
          ? `Billed every ${chosen.interval}. Cancel any time from your account. NordStar Pro never sees your card details.`
          : `One ${chosen.interval} of access per payment. Crypto cannot renew automatically, so we will remind you before it ends.`}
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
