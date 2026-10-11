'use client'

import * as React from 'react'
import Link from 'next/link'
import { Lock, X } from 'lucide-react'

import { markPending, sameItem, useCart, type CartItem } from '@/components/cart/cart-store'
import { CountrySelect, MethodChoice, useChosenMethod, usePaymentMethods } from '@/components/checkout/payment-choice'
import { BusinessDetails, TaxBreakdown, type TaxSummary } from '@/components/checkout/tax-summary'
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
  tax: TaxSummary
}
type Quote = { groups: QuoteGroup[]; unavailable: string[]; held: string[]; country: string }

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
export function CartView() {
  const cart = useCart()
  const toast = useToast()
  const [email, setEmail] = React.useState('')
  const [code, setCode] = React.useState('')
  const [quote, setQuote] = React.useState<Quote | null>(null)
  const [quoting, setQuoting] = React.useState(false)
  const [pending, setPending] = React.useState<string | null>(null)
  // The billing country decides which providers are offered; blank until the server's guess arrives.
  const [country, setCountry] = React.useState('')
  const [company, setCompany] = React.useState('')
  const [taxId, setTaxId] = React.useState('')
  // Bumped by "Update total" to re-quote at once.
  const [requote, setRequote] = React.useState(0)

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
            country: country || undefined,
            taxId: taxId.trim() || undefined,
          }),
          signal: controller.signal,
        })
        if (response.ok) {
          const next = (await response.json()) as Quote
          setQuote(next)
          // The server's guess at the billing country fills the select once.
          setCountry((current) => current || next.country)
        }
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
  }, [itemsKey, code, emailForQuote, country, taxId, requote])

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

  async function checkout(group: QuoteGroup, provider: string) {
    if (!isValidEmail(email)) {
      toast('Enter the email address your access should go to.', 'error')
      return
    }
    // Exactly the lines that were priced together, so the charge matches the figure shown.
    const payable = group.lines
    if (payable.some((line) => quote?.held.includes(line.key))) return
    setPending(group.interval)
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          provider,
          country: country || undefined,
          company: company.trim() || undefined,
          taxId: taxId.trim() || undefined,
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

      <div className="flex flex-col gap-3">
        <CountrySelect id="cart-country" value={country} onChange={setCountry} className="sm:max-w-xs" />
        <BusinessDetails
          idPrefix="cart"
          company={company}
          taxId={taxId}
          onCompany={setCompany}
          onTaxId={setTaxId}
          onUpdate={() => setRequote((value) => value + 1)}
        />
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
              <div className="mb-4 rounded-lg border border-line px-4 py-3">
                <TaxBreakdown
                  summary={group.tax}
                  currency={group.currency}
                  discountLabel={group.offerName ? (group.codeApplied ? code.trim().toUpperCase() : group.offerName) : null}
                />
              </div>
              <GroupPayment
                group={group}
                per={per}
                country={country}
                onDetected={(code) => setCountry((current) => current || code)}
                disabled={pending !== null || quoting || blocked}
                pending={pending === group.interval}
                quoting={quoting}
                onPay={(provider) => checkout(group, provider)}
              />
            </div>
          </section>
        )
      })}
    </div>
  )
}

/**
 * How one group is paid: the providers this buyer is offered for its currency, and the pay
 * button. One per group, because groups are separate orders and may differ in currency.
 */
function GroupPayment({
  group,
  per,
  country,
  onDetected,
  disabled,
  pending,
  quoting,
  onPay,
}: {
  group: QuoteGroup
  per: string
  country: string
  onDetected: (code: string) => void
  disabled: boolean
  pending: boolean
  quoting: boolean
  onPay: (provider: string) => void
}) {
  const { methods, detected } = usePaymentMethods(group.currency, country)
  const [chosen, setChosen] = useChosenMethod(methods)

  React.useEffect(() => {
    if (detected) onDetected(detected)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detected])

  return (
    <>
      <MethodChoice name={`pay-${group.interval}`} methods={methods} value={chosen} onChange={setChosen} per={per} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[17px] text-ink">
          {formatPrice(group.chargeCents, group.currency)}
          <span className="text-ink-dim"> / {per}</span>
          {quoting && <Spinner className="ml-2 inline-block" />}
        </p>
        <Button onClick={() => chosen && onPay(chosen)} disabled={disabled || !chosen}>
          {pending && <Spinner />}
          Pay {formatPrice(group.chargeCents, group.currency)}
        </Button>
      </div>
      <p className="mt-3 flex items-start gap-2 text-[13px] leading-relaxed text-ink-dim">
        <Lock aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Nothing is charged until you confirm with the provider you choose.
      </p>
    </>
  )
}
