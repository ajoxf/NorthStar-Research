'use client'

import * as React from 'react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { isValidEmail } from '@/lib/utils'

/**
 * Ask for pricing.
 *
 * The same two numbers a member gives, asked the same way, because a prospect who has
 * given a WhatsApp number is reachable there before they are a member — which is most of
 * the reason to ask at this stage rather than after they pay.
 *
 * On success it says a person will be in touch, and does not pretend anything was sent
 * automatically. Pricing goes out from the desk by hand; promising an instant email and
 * then not sending one is the fastest way to look broken.
 */
export function EnquiryForm() {
  const toast = useToast()
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [phone, setPhone] = React.useState('')
  const [sameLine, setSameLine] = React.useState(true)
  const [whatsapp, setWhatsapp] = React.useState('')
  const [note, setNote] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (name.trim().length < 2) return setError('Tell us your name.')
    if (!isValidEmail(email)) return setError('Enter an email address we can reply to.')
    if (phone.trim().length < 6) return setError('Enter a mobile number, including the country code.')

    setPending(true)
    try {
      const response = await fetch('/api/pricing-enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          phoneNumber: phone,
          whatsappSameAsPhone: sameLine,
          whatsappNumber: sameLine ? undefined : whatsapp,
          note: note || undefined,
        }),
      })
      const data = await response.json().catch(() => null)

      if (!response.ok) {
        const message = data?.error ?? 'That could not be sent. Please try again.'
        setError(message)
        toast(message, 'error')
        return
      }

      setDone(true)
    } catch {
      setError('We could not reach the server. Please try again.')
    } finally {
      setPending(false)
    }
  }

  if (done) {
    return (
      <div className="flex items-start gap-2.5 rounded-lg border border-up/35 bg-up/10 p-5 text-[14px] leading-relaxed text-ink">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-up" aria-hidden />
        <div>
          <strong className="font-medium">Thank you — we have your request.</strong>
          <p className="mt-1 text-ink-dim">
            Someone from the desk will send you pricing and a payment link shortly. It comes from a
            person, not an autoresponder, so give it a little time.
          </p>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-4">
        <Label htmlFor="enq-name">Your name</Label>
        <Input
          id="enq-name"
          value={name}
          autoComplete="name"
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>

      <div className="mb-4">
        <Label htmlFor="enq-email">Email</Label>
        <Input
          id="enq-email"
          type="email"
          value={email}
          autoComplete="email"
          placeholder="you@example.com"
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>

      <div className="mb-4">
        <Label htmlFor="enq-phone">Mobile number</Label>
        <Input
          id="enq-phone"
          type="tel"
          value={phone}
          autoComplete="tel"
          placeholder="+1 555 000 0000"
          onChange={(event) => setPhone(event.target.value)}
          required
        />
        <Hint>Include the country code.</Hint>
      </div>

      <div className="mb-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#D0F53C]"
            checked={sameLine}
            onChange={(event) => setSameLine(event.target.checked)}
          />
          <span className="text-[14px] leading-relaxed text-ink-dim">
            WhatsApp is on this same number
          </span>
        </label>

        {!sameLine && (
          <div className="mt-3 animate-fade-up">
            <Label htmlFor="enq-whatsapp">WhatsApp number</Label>
            <Input
              id="enq-whatsapp"
              type="tel"
              value={whatsapp}
              autoComplete="tel"
              placeholder="+1 555 000 0000"
              onChange={(event) => setWhatsapp(event.target.value)}
            />
          </div>
        )}
      </div>

      <div className="mb-5">
        <Label htmlFor="enq-note">Anything you want to ask — optional</Label>
        <Textarea
          id="enq-note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What markets are you trading?"
        />
      </div>

      <FieldError>{error}</FieldError>

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Spinner />
            Sending…
          </>
        ) : (
          <>
            Request pricing
            <ArrowRight className="h-4 w-4" aria-hidden />
          </>
        )}
      </Button>

      <p className="mt-4 text-center text-[12px] leading-relaxed text-ink-dim">
        We will only use these details to reply to you about membership.
      </p>
    </form>
  )
}
