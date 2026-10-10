'use client'

import * as React from 'react'
import Link from 'next/link'
import { Lock, X } from 'lucide-react'

import { markPending, sameItem, useCart, type CartItem } from '@/components/cart/cart-store'
import { Button, ButtonLink, Spinner } from '@/components/ui/button'
import { Hint, Input, Label } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { formatPrice } from '@/lib/package-shape'
import { isValidEmail } from '@/lib/utils'

type QuoteLine = { key: string; kind: 'section' | 'package'; name: string; listCents: number; chargeCents: number; discounted: boolean }
type QuoteGroup = {
  interval: 'month' | 'year'
  currency: string
  lines: QuoteLine[]
  listCents: number
  chargeCents: number
  offerName: string | null
  percentOff: number
  codeApplied: boolean
}
type Quote = { groups: QuoteGroup[]; unavailable: string[]; held: string[] }

const keyOf = (item: Pick<CartItem, 'kind' | 'id'>) => `${item.kind}:${item.id}`
const refOf = (key: string) => {
  const [kind, ...rest] = key.split(':')
  return { kind: kind as CartItem['kind'], id: rest.join(':') }
}

/**
 * The cart page.
 *
 * Grouped by billing period, because each group is its own checkout: Stripe cannot put a
 * monthly and a yearly price in one subscription, and a crypto payment buys one period.
 * Every figure here comes from /api/cart/quote — the browser holds only which items.
 */
export function CartView({ cardReady, cryptoReady }: { cardReady: boolean; cryptoReady: boolean }) {
  const cart = useCart()
  const toast = useToast()
  const [email, setEmail] = React.useState('')
  const [code, setCode] = React.useState('')
  const [quote, setQuote] = React.useState<Quote | null>(null)
  const [quoting, setQuoting] = React.useState(false)
  const [pending, setPending] = React.useState<string | null>(null)

  const itemsKey = cart.items.map(keyOf).join(',')
  const emailForQuote = isValidEmail(email) ? email.trim() : ''

  // Re-priced whenever what is in the cart, the code or the email changes. The email only
  // matters for flagging sections this address already holds.
  React.useEffect(() => {
    if (cart.items.length === 0) {
      setQuote(null)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setQuoting(true)
      try {
        const response = await fetch('/api/cart/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            items: cart.items.map(({ kind, id }) => ({ kind, id })),
            code: code.trim() || undefined,
            email: emailForQuote || undefined,
          }),
          signal: controller.signal,
        })
        if (response.ok) setQuote((await response.json()) as Quote)
      } catch {
        // Aborted by a newer quote, or offline: the last good quote stays on screen.
      } finally {
        setQuoting(false)
      }
    }, 300)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, code, emailForQuote])

  // Anything no longer on sale leaves the cart, and the buyer is told which.
  React.useEffect(() => {
    if (!quote || quote.unavailable.length === 0) return
    for (const key of quote.unavailable) {
      const item = cart.items.find((entry) => keyOf(entry) === key)
      if (item) {
        cart.remove(item)
        toast(`${item.name} is no longer on sale and was removed from your cart.`, 'error')
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote])

  async function checkout(group: QuoteGroup, method: 'card' | 'crypto') {
    if (!isValidEmail(email)) {
      toast('Enter the email address your access should go to.', 'error')
      return
    }
    // Exactly the lines that were priced together, so the charge matches the figure shown.
    const payable = group.lines
    if (payable.some((line) => quote?.held.includes(line.key))) return
    setPending(`${group.interval}:${method}`)
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          method,
          items: payable.map((line) => refOf(line.key)),
          offerCode: code.trim() || undefined,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.checkoutUrl) {
        toast(data?.error ?? `Could not start checkout (HTTP ${response.status}).`, 'error')
        return
      }
      // Taken out of the cart only once the payment succeeds; see the success page.
      markPending(payable.map((line) => refOf(line.key)))
      window.location.href = data.checkoutUrl
    } catch {
      toast('Could not reach the server. Nothing has been charged.', 'error')
    } finally {
      setPending(null)
    }
  }

  if (cart.items.length === 0) {
    return (
      <div className="mt-10 rounded-xl border border-line bg-panel px-6 py-10 text-center">
        <p className="text-[17px] text-ink">Your cart is empty.</p>
        <p className="mt-2 text-[15px] text-ink-dim">Add sections or packages, then pay for them together.</p>
        <div className="mt-6 flex justify-center gap-3">
          <ButtonLink href="/" variant="secondary">Back to home</ButtonLink>
          <ButtonLink href="/join">Memberships</ButtonLink>
        </div>
      </div>
    )
  }

  const groups = quote?.groups ?? []
  const split = groups.length > 1

  return (
    <div className="mt-8 flex flex-col gap-8">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cart-email">Email</Label>
          <Input
            id="cart-email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Hint>Your access, or the code to activate it, goes here.</Hint>
        </div>
        <div>
          <Label htmlFor="cart-code">Discount code</Label>
          <Input id="cart-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Optional" />
          <Hint>One discount per order, applied to everything it covers.</Hint>
        </div>
      </div>

      {split && (
        <p className="rounded-lg border border-line bg-panel px-4 py-3 text-[15px] leading-relaxed text-ink-dim">
          Your cart has monthly and yearly items. They are paid for separately — one checkout for
          each group below.
        </p>
      )}

      {!quote && quoting && (
        <p className="flex items-center gap-2 text-[15px] text-ink-dim">
          <Spinner /> Pricing your cart…
        </p>
      )}

      {groups.map((group) => {
        const heldInGroup = group.lines.filter((line) => quote?.held.includes(line.key))
        const total = group.chargeCents
        const blocked = heldInGroup.length > 0
        const per = group.interval === 'year' ? 'year' : 'month'
        return (
          <section key={group.interval} className="rounded-xl border border-line bg-panel">
            <header className="flex items-baseline justify-between border-b border-line px-5 py-4">
              <h2 className="text-xl text-ink">{group.interval === 'year' ? 'Yearly' : 'Monthly'}</h2>
              {group.offerName && (
                <span className="text-[14px] text-accent-ink">
                  {group.offerName} — {group.percentOff}% off{group.codeApplied ? ' (your code)' : ''}
                </span>
              )}
            </header>

            <ul className="divide-y divide-line">
              {group.lines.map((line) => {
                const held = quote?.held.includes(line.key)
                return (
                  <li key={line.key} className="flex items-center gap-4 px-5 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[16px] text-ink">{line.name}</p>
                      <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-dim">
                        {line.kind === 'section' ? 'Section' : 'Package'}
                        {held ? ' · You already have this' : ''}
                      </p>
                    </div>
                    <div className="text-right font-mono text-[15px]">
                      {line.discounted && (
                        <span className="mr-2 text-ink-dim line-through">{formatPrice(line.listCents, group.currency)}</span>
                      )}
                      <span className={held ? 'text-ink-dim line-through' : 'text-ink'}>
                        {formatPrice(line.chargeCents, group.currency)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => cart.remove(refOf(line.key))}
                      aria-label={`Remove ${line.name}`}
                      className="rounded-full p-1.5 text-ink-dim hover:bg-ink/5 hover:text-ink"
                    >
                      <X aria-hidden className="h-4 w-4" />
                    </button>
                  </li>
                )
              })}
            </ul>

            <div className="border-t border-line px-5 py-4">
              {heldInGroup.length > 0 && (
                <p className="mb-3 text-[14px] text-ink-dim">
                  {heldInGroup.length === 1 ? 'One item is' : `${heldInGroup.length} items are`} already on your
                  account. Remove {heldInGroup.length === 1 ? 'it' : 'them'} to check out, or{' '}
                  <Link href="/login" className="underline">sign in</Link> to read what you have.
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[17px] text-ink">
                  {formatPrice(total, group.currency)}
                  <span className="text-ink-dim"> / {per}</span>
                  {quoting && <Spinner className="ml-2 inline-block" />}
                </p>
                <div className="flex gap-2.5">
                  <Button
                    onClick={() => checkout(group, 'card')}
                    disabled={!cardReady || pending !== null || quoting || blocked}
                    title={cardReady ? undefined : 'Card payment is not available yet'}
                  >
                    {pending === `${group.interval}:card` && <Spinner />}
                    Pay by card
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => checkout(group, 'crypto')}
                    disabled={!cryptoReady || pending !== null || quoting || blocked}
                    title={cryptoReady ? undefined : 'Crypto payment is not available yet'}
                  >
                    {pending === `${group.interval}:crypto` && <Spinner />}
                    Crypto
                  </Button>
                </div>
              </div>
              <p className="mt-3 flex items-start gap-2 text-[13px] leading-relaxed text-ink-dim">
                <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Card renews every {per} until you cancel. Crypto pays for one {per}; we remind you before it ends.
              </p>
            </div>
          </section>
        )
      })}
    </div>
  )
}
