'use client'

import * as React from 'react'
import { ArrowRight } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

/**
 * Buy one section.
 *
 * Email first, then card or crypto, mirroring the all-access join form — the address is
 * where the access code goes, so asking for it before the payment method is the honest
 * order rather than a form that surprises somebody after they have chosen how to pay.
 *
 * Nothing is granted here. This starts a checkout; the webhook and the redemption that
 * follows are what actually give somebody access, which is why reaching the success page
 * proves nothing.
 */
export function SectionBuy({ sectionId, name }: { sectionId: string; name: string }) {
  const toast = useToast()
  const [email, setEmail] = React.useState('')
  const [pending, setPending] = React.useState<'card' | 'crypto' | null>(null)

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
      <Label htmlFor={`buy-${sectionId}`}>Your email</Label>
      <Input
        id={`buy-${sectionId}`}
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        autoComplete="email"
        aria-label={`Email address for ${name}`}
      />
      <div className="mt-3 flex flex-wrap gap-3">
        <Button onClick={() => start('card')} disabled={pending !== null}>
          {pending === 'card' ? <Spinner /> : null}
          Pay by card
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Button>
        <Button variant="secondary" onClick={() => start('crypto')} disabled={pending !== null}>
          {pending === 'crypto' ? <Spinner /> : null}
          Pay in crypto
        </Button>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-ink-dim">
        We email your access code once the payment confirms. Card renews automatically and can be
        cancelled any time; crypto you renew yourself.
      </p>
    </div>
  )
}
