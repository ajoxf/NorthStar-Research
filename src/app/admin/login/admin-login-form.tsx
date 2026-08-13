'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/field'

export function AdminLoginForm() {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(event.currentTarget)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: String(form.get('email') ?? ''),
          password: String(form.get('password') ?? ''),
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'Sign-in failed.')
        setPending(false)
        return
      }

      // Non-admins share the same login endpoint; they simply have no admin console to
      // land in. The server re-checks the role on every /admin request regardless.
      if (data.role !== 'admin') {
        setError('That account does not have administrator access.')
        setPending(false)
        return
      }

      router.push('/admin')
      router.refresh()
    } catch {
      setError('Sign-in failed. Try again.')
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-line bg-panel p-6" noValidate>
      <div className="mb-4">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>

      <div className="mb-5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <FieldError>{error}</FieldError>
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Spinner />
            Signing in…
          </>
        ) : (
          'Sign in'
        )}
      </Button>
    </form>
  )
}
