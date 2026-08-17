'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label, Select } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { type BillingIntervalValue, formatPrice, parsePriceCents } from '@/lib/package-shape'

/**
 * The price, as one box.
 *
 * This is the whole pricing control for a site selling one thing, which is what this
 * site sells. Type a number, save, and both processors follow: Stripe gets a new Price
 * object created for the amount and the package is repointed at it, Cregis is simply
 * told the amount at checkout. No Stripe dashboard, no price IDs, no second screen.
 *
 * The Stripe price ID is deliberately absent. It is a mechanism, not a decision, and
 * putting it here would make the common case look like the hard case. The packages
 * screen still exposes it for an operator who has an existing price to reuse.
 */
export type PricingState = {
  /** Null until the first package exists — the site is still on the built-in plan. */
  packageId: string | null
  name: string
  description: string | null
  priceCents: number
  currency: string
  interval: BillingIntervalValue
  features: string[]
  sellByCard: boolean
  stripeReady: boolean
}

export function PricingForm({ state }: { state: PricingState }) {
  const router = useRouter()
  const toast = useToast()

  const [price, setPrice] = React.useState(
    (state.priceCents / 100).toFixed(2).replace(/\.00$/, ''),
  )
  const [interval, setInterval] = React.useState<BillingIntervalValue>(state.interval)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const cents = parsePriceCents(price)
  const changed = cents !== state.priceCents || interval !== state.interval

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (cents === null) {
      setError('Enter a price like 199 or 249.50 — digits only.')
      return
    }

    // Spelled out rather than left to a toast afterwards. This changes what the site
    // charges every new buyer, and it is the one action on this screen that money
    // depends on.
    const confirmed = window.confirm(
      `Change the price to ${formatPrice(cents)} per ${interval}?\n\n` +
        `New buyers pay this from now on. Anyone already subscribed keeps the price they ` +
        `signed up at — Stripe keeps billing their existing price until you move them ` +
        `deliberately.`,
    )
    if (!confirmed) return

    setPending(true)
    try {
      // The first save creates the package; later ones edit it. Same body either way,
      // so the form does not need two shapes.
      const response = await fetch(
        state.packageId ? `/api/admin/packages/${state.packageId}` : '/api/admin/packages',
        {
          method: state.packageId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: state.name,
            description: state.description || undefined,
            priceCents: cents,
            currency: state.currency,
            interval,
            sellByCard: state.sellByCard && state.stripeReady,
            features: state.features,
            sortOrder: 0,
          }),
        },
      )

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const message = data?.error ?? `Could not save (HTTP ${response.status}).`
        setError(message)
        toast(message, 'error')
        return
      }

      toast(`Price is now ${formatPrice(cents)} per ${interval}`, 'success')
      router.refresh()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-line bg-panel p-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-[minmax(0,180px)_minmax(0,180px)_auto] sm:items-end">
        <div>
          <Label htmlFor="price">Price (USD)</Label>
          <Input
            id="price"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            inputMode="decimal"
            placeholder="199"
          />
        </div>

        <div>
          <Label htmlFor="interval">Billed every</Label>
          <Select
            id="interval"
            value={interval}
            onChange={(event) => setInterval(event.target.value as BillingIntervalValue)}
          >
            <option value="month">Month</option>
            <option value="year">Year</option>
          </Select>
        </div>

        <Button type="submit" disabled={pending || !changed}>
          {pending && <Spinner />}
          {pending ? 'Saving…' : 'Save price'}
        </Button>
      </div>

      <Hint>
        {cents === null
          ? 'Digits only — 199, or 249.50.'
          : `The site will advertise ${formatPrice(cents)} per ${interval}` +
            (state.stripeReady && state.sellByCard
              ? ', and a matching Stripe price is created automatically so card buyers are charged the same.'
              : '. Card payments are off, so this applies to crypto only.')}
      </Hint>

      <FieldError>{error}</FieldError>
    </form>
  )
}
