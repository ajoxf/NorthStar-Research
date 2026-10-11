'use client'

import * as React from 'react'
import { ArrowRight } from 'lucide-react'

import { AddToCartButton } from '@/components/cart/cart-buttons'
import { useChosenMethod, useCountryOptions, usePaymentMethods } from '@/components/checkout/payment-choice'
import { Button, ButtonLink, Spinner } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

/**
 * Buy one section, or start its free trial.
 *
 * The trial leads where one is open, because reading the research for a fortnight is a
 * better first step than paying for it sight unseen, and it is the step most people would
 * take if offered. The payment form stays underneath either way, for somebody who has
 * already decided — the price is on the card above both, so neither is hiding a figure.
 *
 * Email first, then card or crypto, mirroring the all-access join form: the address is
 * where the access code goes, so asking for it before the payment method is the honest
 * order rather than a form that surprises somebody after they have chosen how to pay.
 *
 * Nothing is granted here. This starts a checkout; the webhook and the redemption that
 * follows are what actually give somebody access, which is why reaching the success page
 * proves nothing.
 */
const SELECT = 'rounded-lg border px-3 text-[16px] sm:text-[14px]'
const LIGHT = 'border-line-on-light bg-white text-ink-on-light'
const DARK = 'border-line bg-panel-2 text-ink'

export function SectionBuy({
  sectionId,
  name,
  trialDays,
  trialSlug,
  tone = 'dark',
  currency = 'USD',
}: {
  sectionId: string
  name: string
  /** What the section is priced in; decides which providers are offered. */
  currency?: string
  /**
   * The ground this card sits on.
   *
   * The inputs and the secondary button draw themselves in `ink`, which is white — right
   * on black and invisible on the near-white cards these now sit in. Passed rather than
   * guessed, because the component cannot see its own background.
   */
  tone?: 'dark' | 'light'
  /**
   * How many days this subject's trial runs, when one is open.
   *
   * Asked of the trial system by the page above rather than read off a switch here: a
   * section whose item is archived has the switch on and nothing to open, and a button to
   * a page that refuses everybody is worse than no button.
   */
  trialDays?: number | null
  /** The item slug /trial addresses. Absent when no trial is open. */
  trialSlug?: string | null
}) {
  const toast = useToast()
  const [email, setEmail] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [country, setCountry] = React.useState('')
  const { methods, detected } = usePaymentMethods(currency, country)
  const [chosen, setChosen] = useChosenMethod(methods)
  React.useEffect(() => {
    if (detected) setCountry((current) => current || detected)
  }, [detected])
  const countries = useCountryOptions()

  const hasTrial = Boolean(trialDays && trialSlug)
  const light = tone === 'light'

  async function start() {
    if (!email.trim()) {
      toast('Enter the email address your access code should go to.', 'error')
      return
    }
    if (!chosen) return
    setPending(true)
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), sectionId, provider: chosen, country: country || undefined }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok || !data?.checkoutUrl) {
        toast(data?.error ?? `Could not start checkout (HTTP ${response.status}).`, 'error')
        return
      }
      window.location.href = data.checkoutUrl
    } catch {
      toast('Could not reach the server. Nothing has been charged.', 'error')
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      {hasTrial && (
        <div className={`mb-5 border-b pb-5 ${light ? 'border-line-on-light' : 'border-line'}`}>
          <ButtonLink
            href={`/trial?item=${encodeURIComponent(trialSlug!)}`}
            size="lg"
            className="w-full sm:w-auto"
          >
            Start a {trialDays}-day free trial
            <ArrowRight className="h-4 w-4" aria-hidden />
          </ButtonLink>
          <p
            className={`mt-2.5 text-[13px] leading-relaxed ${light ? 'text-ink-on-light-dim' : 'text-ink-dim'}`}
          >
            No card. It stops on its own — there is nothing to cancel.
          </p>
        </div>
      )}

      <p
        className={`font-mono text-[11px] uppercase tracking-[0.14em] ${light ? 'text-ink-on-light-dim' : 'text-ink-dim'}`}
      >
        {hasTrial ? 'Or subscribe now' : 'Subscribe'}
      </p>

      {/*
        The address and the two buttons on one row from `sm` up.

        They are one action — "send my code here, by this method" — and stacking the label,
        the field and two buttons made a short form look like a long one.
      */}
      <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row">
        <Input
          id={`buy-${sectionId}`}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          aria-label={`Email address for ${name}`}
          tone={light ? 'light' : 'dark'}
          className="sm:flex-1"
        />
        <div className="flex shrink-0 gap-2.5">
          {methods && methods.length > 1 && (
            <select
              value={chosen ?? ''}
              onChange={(event) => setChosen(event.target.value)}
              aria-label="How to pay"
              className={`min-w-0 flex-1 sm:w-44 sm:flex-none ${SELECT} ${light ? LIGHT : DARK}`}
            >
              {methods.map((method) => (
                <option key={method.id} value={method.id}>
                  {method.label}
                </option>
              ))}
            </select>
          )}
          <Button onClick={start} disabled={pending || !chosen}>
            {pending ? <Spinner /> : null}
            {methods && methods.length === 1 ? methods[0].label : 'Pay'}
          </Button>
        </div>
      </div>

      {methods && methods.length === 0 && (
        <p className={`mt-3 text-[14px] leading-relaxed ${light ? 'text-ink-on-light' : 'text-ink'}`}>
          Online payment isn&rsquo;t available for this country yet. Please{' '}
          <a href="/faqs" className="underline underline-offset-4">contact us</a> and we will arrange it.
        </p>
      )}

      <div className={`mt-3 flex flex-wrap items-center gap-2 text-[13px] ${light ? 'text-ink-on-light-dim' : 'text-ink-dim'}`}>
        <label htmlFor={`country-${sectionId}`}>Billing country</label>
        <select
          id={`country-${sectionId}`}
          value={country}
          onChange={(event) => setCountry(event.target.value)}
          className={`h-8 max-w-[14rem] ${SELECT} ${light ? LIGHT : DARK}`}
        >
          <option value="">Choose…</option>
          {countries.map((option) => (
            <option key={option.code} value={option.code}>
              {option.name}
            </option>
          ))}
        </select>
      </div>

      <p
        className={`mt-3 text-[13px] leading-relaxed ${light ? 'text-ink-on-light-dim' : 'text-ink-dim'}`}
      >
        We email your access once the payment confirms. Card renews automatically and can be
        cancelled any time; other methods pay for one period and we remind you before it ends.
      </p>

      {/* Buying several subjects? Collect them and pay once. */}
      <div className="mt-3">
        <AddToCartButton item={{ kind: 'section', id: sectionId, name }} tone={tone} />
      </div>
    </div>
  )
}
