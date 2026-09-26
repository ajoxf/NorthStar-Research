'use client'

import * as React from 'react'
import { ArrowRight, Bitcoin, Check, CreditCard, Lock } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { authorInitials } from '@/lib/section-shape'
import { formatPrice } from '@/lib/package-shape'
import { cn, isValidEmail } from '@/lib/utils'
import { UploadedImage } from '@/components/uploaded-image'

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
  /** Whose package this is — the face on the summary card. Null for the house membership. */
  authorName: string | null
  authorPhotoUrl: string | null
  /** The package's own artwork, shown above the name on the order summary. */
  imageUrl: string | null
  /** The subjects this package grants, named as the entitlement names them. */
  includes: string[]
}

/**
 * Checkout: what you are buying on the left, what we need from you on the right.
 *
 * Both columns are in one client component on purpose. The summary has to restate itself
 * the instant a different package is chosen — a buyer who switches plans and sees the old
 * price still sitting in the summary has been given two numbers and no way to tell which
 * one will be charged. Splitting this into a server-rendered summary and a client form
 * would put the selection on one side of a boundary and the figure on the other.
 *
 * Nothing here grants anything. This starts a checkout; the webhook and the redemption
 * that follows are what give somebody access, which is why reaching the success page on
 * its own proves nothing.
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
    <div className="grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] lg:gap-12">
      <OrderSummary chosen={chosen} price={price} />

      <form onSubmit={handleSubmit} noValidate className="order-first lg:order-none">
        {packages.length > 1 && (
          <Step number="01" title="What are you subscribing to?">
            <div className="grid gap-2" role="radiogroup" aria-label="Membership">
              {packages.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  role="radio"
                  aria-checked={pkg.id === chosen.id}
                  onClick={() => setPackageId(pkg.id)}
                  className={cn(
                    'flex items-start justify-between gap-3 rounded-xl border p-4 text-left transition-colors',
                    pkg.id === chosen.id
                      ? 'border-ink-on-light bg-white shadow-sm'
                      : 'border-ink-on-light/15 bg-white/60 hover:border-ink-on-light/40',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium text-ink-on-light">
                      {pkg.name}
                    </span>
                    {pkg.authorName && (
                      <span className="mt-0.5 block text-[13px] text-ink-on-light-dim">
                        by {pkg.authorName}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[15px] font-medium text-ink-on-light">
                    {formatPrice(pkg.priceCents, pkg.currency)}
                    <span className="text-ink-on-light-dim">
                      /{pkg.interval === 'year' ? 'yr' : 'mo'}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Step>
        )}

        <Step
          number={packages.length > 1 ? '02' : '01'}
          title="Where should we send it?"
          note="Your access code goes to this address. Use one you will still have in a year."
        >
          <Label htmlFor="email" tone="light">
            Email address
          </Label>
          <Input
            id="email"
            tone="light"
            type="email"
            value={email}
            autoComplete="email"
            placeholder="you@example.com"
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={Boolean(error)}
            required
          />
          <FieldError tone="light">{error}</FieldError>
        </Step>

        <Step number={packages.length > 1 ? '03' : '02'} title="How would you like to pay?">
          <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Payment method">
            <MethodOption
              icon={CreditCard}
              label="Card"
              detail={`Renews every ${chosen.interval}`}
              selected={method === 'card'}
              onSelect={() => setMethod('card')}
            />
            <MethodOption
              icon={Bitcoin}
              label="Crypto"
              detail="You renew it yourself"
              selected={method === 'crypto'}
              onSelect={() => setMethod('crypto')}
            />
          </div>

          {!ready && (
            <div className="mt-4 rounded-xl border border-ink-on-light/20 bg-white px-4 py-3.5 text-[13px] leading-relaxed text-ink-on-light">
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
                  Those credentials have not been configured for this deployment, so this option
                  cannot take a payment.{' '}
                  {method === 'card' && cryptoReady && 'Crypto is available in the meantime.'}
                  {method === 'crypto' && cardReady && 'Card payment is available in the meantime.'}
                </>
              )}
            </div>
          )}

          {method === 'crypto' && (
            <div className="mt-4 animate-fade-up">
              <Label htmlFor="phone" tone="light">
                Phone number — optional
              </Label>
              <Input
                id="phone"
                tone="light"
                type="tel"
                value={phone}
                autoComplete="tel"
                placeholder="+1 555 000 0000"
                onChange={(event) => setPhone(event.target.value)}
              />
              <Hint tone="light">
                So the desk can reach you about your order. You can add it later.
              </Hint>
            </div>
          )}
        </Step>

        {/*
          The card details are not asked for here, and that is the point.

          Stripe's own hosted page takes them, so this site never touches a card number.
          The reference design draws the fields inline; copying that would mean either
          collecting card data on our own origin or drawing a decorative form that does
          nothing — and a decorative card field on a checkout is a lie about where the
          number goes.
        */}
        <Button type="submit" size="lg" className="w-full" disabled={pending || !ready}>
          {pending ? (
            <>
              <Spinner />
              Starting checkout…
            </>
          ) : (
            <>
              {method === 'card' ? `Subscribe — ${price}/${chosen.interval}` : `Pay ${price} in crypto`}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </>
          )}
        </Button>

        <p className="mt-3.5 flex items-start gap-2 text-[13px] leading-relaxed text-ink-on-light-dim">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {method === 'card'
            ? `Payment is taken on Stripe's secure page — NordStar Pro never sees your card details. Billed every ${chosen.interval}, cancel any time from your account.`
            : `One ${chosen.interval} of access per payment. Crypto cannot renew automatically, so we will remind you before it ends.`}
        </p>
      </form>
    </div>
  )
}

/**
 * What the buyer is paying for, restated beside the form.
 *
 * The contents list is the package's items — the things a redemption actually grants —
 * with the marketing bullets underneath and clearly secondary. When the two disagree the
 * items are what the member will hold, so they lead.
 */
function OrderSummary({ chosen, price }: { chosen: JoinPackage; price: string }) {
  return (
    <aside className="h-fit overflow-hidden rounded-2xl border border-ink-on-light/12 bg-white shadow-sm lg:sticky lg:top-24">
      {/*
        The package's own artwork at the head of the summary.

        A buyer arriving from a card that had a picture on it should see the same picture
        here — a checkout that looks like a different product from the one clicked is how
        somebody starts wondering whether they clicked the right thing.
      */}
      {chosen.imageUrl && (
        <div className="relative aspect-[16/10] w-full overflow-hidden bg-ink-on-light/5">
          <UploadedImage
            src={chosen.imageUrl}
            sizes="(min-width: 1024px) 512px, 100vw"
            className="h-full w-full object-cover object-top"
          />
        </div>
      )}
      <div className="p-6">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-ink-on-light/5">
          {chosen.authorPhotoUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element -- an arbitrary host, which
               next/image would need configuring for one URL at a time. */
            <img
              src={chosen.authorPhotoUrl}
              alt=""
              className="h-full w-full object-cover object-top"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-full w-full items-center justify-center font-mono text-[15px] text-ink-on-light-dim"
            >
              {authorInitials(chosen.authorName ?? chosen.name)}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-[20px] font-medium leading-tight tracking-[-0.02em] text-ink-on-light">
            {chosen.name}
          </h2>
          <p className="mt-1 text-[13px] text-ink-on-light-dim">
            {chosen.authorName ? `by ${chosen.authorName}` : 'NordStar Pro'}
          </p>
        </div>
      </div>

      {chosen.description && (
        <p className="mt-5 text-[14px] leading-relaxed text-ink-on-light-dim">
          {chosen.description}
        </p>
      )}

      {chosen.includes.length > 0 && (
        <>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-on-light-dim">
            What you get
          </p>
          <ul className="mt-3 space-y-2.5">
            {chosen.includes.map((entry) => (
              <li key={entry} className="flex gap-2.5 text-[14px] leading-snug text-ink-on-light">
                {/* The tick in the band's ink, not in --up. That green is built to glow on
                    black and washes out to about 1.8:1 on a white card. */}
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-ink-on-light" aria-hidden />
                {entry}
              </li>
            ))}
          </ul>
        </>
      )}

      {chosen.features.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-ink-on-light/10 pt-4">
          {chosen.features.map((feature) => (
            <li
              key={feature}
              className="flex gap-2.5 text-[13px] leading-snug text-ink-on-light-dim"
            >
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
              {feature}
            </li>
          ))}
        </ul>
      )}

      {/*
        The archive line is not a flourish. "Everything back to its first edition" is the
        single most common question about a subscription that has been running for a year,
        and answering it beside the price is cheaper than answering it in support.
      */}
      <p className="mt-5 text-[13px] leading-relaxed text-ink-on-light-dim">
        Includes every edition of the above, back to its first — not just what publishes after
        you join.
      </p>

      <div className="mt-6 flex items-baseline justify-between border-t border-ink-on-light/10 pt-5">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-on-light-dim">
          Due today
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className="font-display text-[32px] font-medium tracking-[-0.03em] text-ink-on-light">
            {price}
          </span>
          <span className="text-[13px] text-ink-on-light-dim">/{chosen.interval}</span>
        </span>
      </div>
      </div>
    </aside>
  )
}

function Step({
  number,
  title,
  note,
  children,
}: {
  number: string
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-8">
      <div className="mb-3.5 flex items-baseline gap-3">
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink-on-light-dim">
          Step {number}
        </span>
        <h2 className="font-display text-[19px] font-medium tracking-[-0.02em] text-ink-on-light">
          {title}
        </h2>
      </div>
      {note && (
        <p className="mb-3.5 text-[13px] leading-relaxed text-ink-on-light-dim">{note}</p>
      )}
      {children}
    </section>
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
        'flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-colors',
        selected
          ? 'border-ink-on-light bg-white shadow-sm'
          : 'border-ink-on-light/15 bg-white/60 hover:border-ink-on-light/40',
      )}
    >
      <Icon
        className={cn('h-4 w-4', selected ? 'text-ink-on-light' : 'text-ink-on-light-dim')}
        aria-hidden
      />
      <span className="text-[15px] font-medium text-ink-on-light">{label}</span>
      <span className="text-[12px] text-ink-on-light-dim">{detail}</span>
    </button>
  )
}
