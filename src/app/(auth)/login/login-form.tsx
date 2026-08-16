'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Mail } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Input, Label } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { useToast } from '@/components/ui/toast'
import { isValidEmail } from '@/lib/utils'

type Mode = 'password' | 'magic'

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter()
  const toast = useToast()
  const [mode, setMode] = React.useState<Mode>('password')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [linkSent, setLinkSent] = React.useState(false)

  async function signInWithPassword(event: React.FormEvent<HTMLFormElement>) {
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
      router.push(next ?? data.redirectTo ?? '/dashboard')
      router.refresh()
    } catch {
      setError('Something went wrong. Please try again.')
      setPending(false)
    }
  }

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const email = String(new FormData(event.currentTarget).get('email') ?? '')
    if (!isValidEmail(email)) {
      setError('Enter a valid email address.')
      return
    }

    setPending(true)
    try {
      const response = await fetch('/api/auth/magic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, next }),
      })

      // The response is checked rather than assumed. It used to confirm unconditionally,
      // which meant that when no email provider was configured the screen said "check
      // your email" for a message that was never sent — leaving people waiting instead of
      // trying the password field beside it.
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        setError(data?.error ?? 'We could not send the link. Please try again.')
        return
      }

      // On success the confirmation is deliberately identical whether or not the address
      // has an account, so this cannot be used to discover who is a member.
      setLinkSent(true)
    } catch {
      setError('We could not send the link. Please try again.')
    } finally {
      setPending(false)
    }
  }

  if (linkSent) {
    return (
      <div className="mt-8 animate-fade-up rounded-lg border border-up/30 bg-up/10 p-5">
        <div className="mb-2 flex items-center gap-2">
          <Mail className="h-4 w-4 text-up" aria-hidden />
          <h2 className="text-[15px] text-ink">Check your email</h2>
        </div>
        <p className="text-[14px] leading-relaxed text-ink-dim">
          If that address has an account, a sign-in link is on its way. It expires in 15 minutes.
        </p>
        <button
          type="button"
          onClick={() => setLinkSent(false)}
          className="mt-4 text-[13px] text-accent underline underline-offset-4"
        >
          Use a different method
        </button>
      </div>
    )
  }

  return (
    <div className="mt-8">
      {/*
        Always rendered, never feature-flagged on whether GOOGLE_CLIENT_ID happens to be
        set. A sign-in method that appears only on some deployments is worse than one
        that is always there: members learn the button exists, then cannot find it. If
        the credentials are missing, /api/auth/google/start returns here with a plain
        `google_unavailable` message rather than silently offering nothing.
      */}
      <a
        href={`/api/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ''}`}
        className="flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-line bg-panel text-[15px] font-medium text-ink transition-colors hover:border-accent/50 hover:bg-panel-2"
      >
        <GoogleMark />
        Continue with Google
      </a>

      <div className="my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-line" />
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-dim">or</span>
        <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={mode === 'password' ? signInWithPassword : sendMagicLink} noValidate>
        <div className="mb-4">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>

        {mode === 'password' && (
          <div className="mb-5">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              name="password"
              autoComplete="current-password"
              required
            />
          </div>
        )}

        <FieldError>{error}</FieldError>

        <Button type="submit" size="lg" className="mt-1 w-full" disabled={pending}>
          {pending ? (
            <>
              <Spinner />
              {mode === 'password' ? 'Signing in…' : 'Sending link…'}
            </>
          ) : mode === 'password' ? (
            'Sign in'
          ) : (
            'Email me a sign-in link'
          )}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'password' ? 'magic' : 'password')
          setError(null)
        }}
        className="mt-4 w-full text-center text-[13px] text-ink-dim transition-colors hover:text-ink"
      >
        {mode === 'password' ? 'Sign in with an email link instead' : 'Use my password instead'}
      </button>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z"
      />
    </svg>
  )
}
