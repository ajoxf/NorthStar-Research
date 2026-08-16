'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'

export function AdminLoginForm() {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [linkSent, setLinkSent] = React.useState(false)
  const [sendingLink, setSendingLink] = React.useState(false)

  /**
   * Recovery without a reset-token flow.
   *
   * This reuses the existing magic-link endpoint rather than adding password-reset
   * tokens: it signs you in, it does not reset the password. That is a smaller surface
   * to get wrong, and an admin who is locked out needs to get in, not to rotate a
   * credential. The endpoint answers identically whether or not the account exists, so
   * this cannot be used to probe for admin addresses.
   */
  async function emailSignInLink(email: string) {
    if (!email.trim()) {
      setError('Enter your email address first, then request the link.')
      return
    }

    setError(null)
    setSendingLink(true)
    try {
      await fetch('/api/auth/magic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, next: '/admin' }),
      })
      setLinkSent(true)
    } catch {
      setError('Could not send the link. Try again.')
    } finally {
      setSendingLink(false)
    }
  }

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
        <PasswordInput
          id="password"
          name="password"
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

      {linkSent ? (
        <p className="mt-4 rounded border border-up/30 bg-up/10 px-3 py-2 font-mono text-[12px] leading-relaxed text-ink">
          If that address has an admin account, a sign-in link is on its way. It expires in 15
          minutes.
        </p>
      ) : (
        <button
          type="button"
          disabled={sendingLink}
          onClick={(event) => {
            const form = event.currentTarget.closest('form')
            const email = form?.querySelector<HTMLInputElement>('#email')?.value ?? ''
            void emailSignInLink(email)
          }}
          className="mt-4 w-full text-center font-mono text-[12px] text-ink-dim transition-colors hover:text-ink disabled:opacity-50"
        >
          {sendingLink ? 'Sending…' : 'Forgot your password? Email me a sign-in link'}
        </button>
      )}
    </form>
  )
}
