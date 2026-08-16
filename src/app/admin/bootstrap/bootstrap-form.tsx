'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'

export function BootstrapForm() {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(event.currentTarget)

    try {
      const response = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: String(form.get('secret') ?? ''),
          email: String(form.get('email') ?? ''),
          password: String(form.get('password') ?? ''),
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'Setup failed.')
        setPending(false)
        return
      }

      router.push(data.redirectTo ?? '/admin')
      router.refresh()
    } catch {
      setError('Setup failed. Try again.')
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-7 rounded-lg border border-line bg-panel p-6" noValidate>
      <div className="mb-4">
        <Label htmlFor="secret">Bootstrap secret</Label>
        <PasswordInput id="secret" name="secret" required autoFocus />
        <Hint>The value you set for ADMIN_BOOTSTRAP_SECRET in Vercel.</Hint>
      </div>

      <div className="mb-4">
        <Label htmlFor="email">Admin email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </div>

      <div className="mb-5">
        <Label htmlFor="password">Admin password</Label>
        <PasswordInput
          id="password"
          name="password"
          autoComplete="new-password"
          minLength={12}
          required
        />
        <Hint>At least 12 characters. This account can see every member.</Hint>
        <FieldError>{error}</FieldError>
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Spinner />
            Creating…
          </>
        ) : (
          'Create administrator'
        )}
      </Button>

      <p className="mt-4 text-[12px] leading-relaxed text-ink-dim">
        Afterwards, delete ADMIN_BOOTSTRAP_SECRET from Vercel. This page will refuse to run again
        regardless, but removing it keeps the surface clean.
      </p>
    </form>
  )
}
