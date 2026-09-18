'use client'

import * as React from 'react'
import { ArrowRight } from 'lucide-react'

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
export function SectionBuy({
  sectionId,
  name,
  trialDays,
  trialSlug,
  tone = 'dark',
}: {
  sectionId: string
  name: string
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
  const [pending, setPending] = React.useState<'card' | 'crypto' | null>(null)

  const hasTrial = Boolean(trialDays && trialSlug)
  const light = tone === 'light'

  async function start(method: 'card' | 'crypto') {
    if (!email.trim()) {
      toast('Enter the email address your access code should go to.', 'error')
      return
    }
    setPending(method)
    try {
      const response = await fetch('/api/checkout/section', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), sectionId, method }),
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
      setPending(null)
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
          className={
            light
              ? 'border-ink-on-light/20 bg-white text-ink-on-light placeholder:text-ink-on-light-dim/70 sm:flex-1'
              : 'sm:flex-1'
          }
        />
        <div className="flex shrink-0 gap-2.5">
          <Button onClick={() => start('card')} disabled={pending !== null}>
            {pending === 'card' ? <Spinner /> : null}
            Pay by card
          </Button>
          <Button
            variant={light ? 'on-light' : 'secondary'}
            onClick={() => start('crypto')}
            disabled={pending !== null}
          >
            {pending === 'crypto' ? <Spinner /> : null}
            Crypto
          </Button>
        </div>
      </div>

      <p
        className={`mt-3 text-[13px] leading-relaxed ${light ? 'text-ink-on-light-dim' : 'text-ink-dim'}`}
      >
        We email your access code once the payment confirms. Card renews automatically and can be
        cancelled any time; crypto you renew yourself.
      </p>
    </div>
  )
}
