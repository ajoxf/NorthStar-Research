'use client'

import * as React from 'react'
import { ArrowRight } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { isValidEmail } from '@/lib/utils'

export function JoinForm({ paymentReady }: { paymentReady: boolean }) {
  const toast = useToast()
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!isValidEmail(email)) {
      setError('Enter the email address where you want your access code sent.')
      return
    }

    setPending(true)
    try {
      const response = await fetch('/api/checkout/create', {
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
      {!paymentReady && (
        <div className="mb-5 rounded-lg border border-gold/40 bg-gold/10 px-4 py-3 text-[13px] leading-relaxed text-ink">
          <strong className="font-medium">Payments are not live yet.</strong> The crypto checkout
          credentials have not been configured for this deployment, so this form cannot take a
          payment. Everything else in the portal works — codes can be issued manually from the admin
          console in the meantime.
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

      <div className="mb-6">
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

      <Button type="submit" size="lg" className="w-full" disabled={pending || !paymentReady}>
        {pending ? (
          <>
            <Spinner />
            Starting checkout…
          </>
        ) : (
          <>
            Continue to payment
            <ArrowRight className="h-4 w-4" aria-hidden />
          </>
        )}
      </Button>

      <p className="mt-4 text-center text-[12px] leading-relaxed text-ink-dim">
        You will be taken to our payment processor. NorthStar Research never sees or stores your
        payment details.
      </p>
    </form>
  )
}
