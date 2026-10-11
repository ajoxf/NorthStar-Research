'use client'

import * as React from 'react'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label, Textarea } from '@/components/ui/field'

type Field = 'name' | 'email' | 'slug' | 'website' | 'promotion'

/** The application form. Says what happens next, and nothing is live until we approve it. */
export function PartnerForm({ invite }: { invite: string | null }) {
  const [pending, setPending] = React.useState(false)
  const [done, setDone] = React.useState(false)
  const [error, setError] = React.useState<{ message: string; field?: Field } | null>(null)
  const [slug, setSlug] = React.useState('')

  const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32)

  if (done) {
    return (
      <div role="status" className="mt-8 rounded-2xl bg-paper-card p-6 text-ink-on-light shadow-sm">
        <p className="text-[19px]">Thank you — your application is in.</p>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-on-light-dim">
          We review every application by hand and will email you either way. Once approved, you will get a link to set up
          your partner dashboard.
        </p>
      </div>
    )
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setPending(true)
    setError(null)
    const response = await fetch('/api/partners/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: String(form.get('name') ?? ''),
        email: String(form.get('email') ?? ''),
        slug: cleanSlug,
        website: String(form.get('website') ?? ''),
        promotion: String(form.get('promotion') ?? ''),
        company: String(form.get('company') ?? ''),
        ...(invite ? { invite } : {}),
      }),
    }).catch(() => null)
    setPending(false)
    if (response?.ok) return setDone(true)
    const body = await response?.json().catch(() => null)
    setError({ message: body?.error ?? 'Something went wrong. Please try again.', field: body?.field })
  }

  const errorFor = (field: Field) => (error?.field === field ? error.message : null)

  return (
    <form onSubmit={submit} noValidate className="mt-8 space-y-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="name" tone="light">Your name</Label>
          <Input id="name" name="name" tone="light" autoComplete="name" required aria-invalid={Boolean(errorFor('name'))} />
          <FieldError tone="light">{errorFor('name')}</FieldError>
        </div>
        <div>
          <Label htmlFor="email" tone="light">Email</Label>
          <Input id="email" name="email" type="email" tone="light" autoComplete="email" required aria-invalid={Boolean(errorFor('email'))} />
          <FieldError tone="light">{errorFor('email')}</FieldError>
        </div>
      </div>
      <div>
        <Label htmlFor="slug" tone="light">Your link name</Label>
        <Input id="slug" name="slug" tone="light" value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="your-name" maxLength={40} required aria-invalid={Boolean(errorFor('slug'))} />
        <Hint tone="light">{cleanSlug ? `Your link will end in ?ref=${cleanSlug}` : 'Letters, numbers and dashes. It cannot be changed later.'}</Hint>
        <FieldError tone="light">{errorFor('slug')}</FieldError>
      </div>
      <div>
        <Label htmlFor="website" tone="light">Website or social profile</Label>
        <Input id="website" name="website" tone="light" placeholder="https://" maxLength={300} />
      </div>
      <div>
        <Label htmlFor="promotion" tone="light">How will you share NordStar Pro?</Label>
        <Textarea id="promotion" name="promotion" tone="light" rows={4} maxLength={2000} placeholder="Your audience, where you publish, roughly how many people you reach." />
      </div>
      {/* Hidden from people; a bot filling every field fills this and is quietly ignored. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="company">Company</label>
        <input id="company" name="company" tabIndex={-1} autoComplete="off" />
      </div>
      <FieldError tone="light">{error && !error.field ? error.message : null}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending && <Spinner />}
        Send application
      </Button>
    </form>
  )
}
