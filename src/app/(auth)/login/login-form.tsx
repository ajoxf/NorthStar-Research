'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter()
  const toast = useToast()
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
        setError(data.error ?? 'Incorrect email or password.')
        setPending(false)
        return
      }

      toast('Signed in', 'success')
      // `next` returns the member to the report they clicked in an email or WhatsApp
      // message — the sign-in gate is a detour, not a dead end.
      router.push(next ?? data.redirectTo ?? '/dashboard')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8" noValidate>
      <div className="mb-4">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required autoFocus />
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

      <Button type="submit" size="lg" className="w-full" disabled={pending}>
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
