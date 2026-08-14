'use client'

import * as React from 'react'
import { ArrowRight, CheckCircle2 } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label, Textarea } from '@/components/ui/field'
import { isValidEmail } from '@/lib/utils'

/**
 * Sample-report enquiry form.
 *
 * The confirmation copy is careful: it promises a human will be in touch, not that a
 * report is on its way. Nothing is sent automatically, and saying otherwise would set
 * up an expectation the system deliberately does not meet.
 */
export function SampleReportForm() {
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [note, setNote] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError('Tell us your name.')
      return
    }
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.')
      return
    }

    setPending(true)
    try {
      const response = await fetch('/api/sample-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, note: note.trim() || undefined }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'That did not go through. Please try again.')
        return
      }

      setSent(true)
    } catch {
      setError('We could not reach the server. Please try again.')
    } finally {
      setPending(false)
    }
  }

  if (sent) {
    return (
      <div className="panel animate-fade-up p-7 text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-up/40 bg-up/10">
          <CheckCircle2 className="h-6 w-6 text-up" aria-hidden />
        </div>
        <h3 className="font-display text-xl text-ink">Request received</h3>
        <p className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-ink-dim">
          Someone from the desk will be in touch at{' '}
          <span className="text-ink">{email}</span> shortly. Nothing has been sent
          automatically — a person reviews every request.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="panel p-7" noValidate>
      <div className="mb-4">
        <Label htmlFor="sr-name">Your name</Label>
        <Input
          id="sr-name"
          value={name}
          autoComplete="name"
          onChange={(event) => setName(event.target.value)}
          required
        />
      </div>

      <div className="mb-4">
        <Label htmlFor="sr-email">Email</Label>
        <Input
          id="sr-email"
          type="email"
          value={email}
          autoComplete="email"
          placeholder="you@example.com"
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>

      <div className="mb-5">
        <Label htmlFor="sr-note">Anything we should know? — optional</Label>
        <Textarea
          id="sr-note"
          rows={3}
          value={note}
          maxLength={1000}
          placeholder="What you trade, what you are looking for."
          onChange={(event) => setNote(event.target.value)}
        />
        <Hint>Helps us send something relevant rather than generic.</Hint>
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
            Request a sample report
            <ArrowRight className="h-4 w-4" aria-hidden />
          </>
        )}
      </Button>
    </form>
  )
}
