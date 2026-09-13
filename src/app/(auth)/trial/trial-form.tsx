'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { Button, Spinner } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'

/**
 * Starting a trial: email, a password, and nothing else.
 *
 * Deliberately shorter than the redemption wizard. That form asks for a mobile number
 * because every route into a paid membership passes through it and the desk needs a way to
 * reach people who have paid. A trialist has paid nothing and may never return, so asking
 * costs signups and buys a phone number nobody will ring.
 */
export function TrialForm({ days }: { days: number }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  // The refusal and, where there is one, the way out of it.
  const [error, setError] = useState<{ message: string; signIn?: string } | null>(null)

  async function submit(formData: FormData) {
    setPending(true)
    setError(null)
    try {
      const response = await fetch('/api/trial', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: String(formData.get('email') ?? ''),
          password: String(formData.get('password') ?? ''),
          firstName: String(formData.get('firstName') ?? ''),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setError({
          message: body.error ?? 'That did not work. Please try again.',
          signIn: typeof body.signIn === 'string' ? body.signIn : undefined,
        })
        return
      }
      router.push('/dashboard')
      router.refresh()
    } catch {
      setError({ message: 'That did not work. Please try again.' })
    } finally {
      setPending(false)
    }
  }

  return (
    <form action={submit} className="mt-8 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="firstName">First name</Label>
        <Input id="firstName" name="firstName" autoComplete="given-name" placeholder="Optional" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@firm.com" />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Choose a password</Label>
        <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" />
        <p className="text-[13px] text-ink-dim">At least 8 characters.</p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-down/35 bg-down/10 px-3.5 py-2.5 text-[14px] text-down">
          <p>{error.message}</p>
          {error.signIn && (
            <Link
              href={error.signIn}
              className="mt-1.5 inline-block font-medium text-ink underline underline-offset-4"
            >
              Sign in
            </Link>
          )}
        </div>
      )}

      <Button type="submit" size="lg" disabled={pending} className="mt-1 w-full">
        {pending ? <Spinner /> : null}
        {pending ? 'Setting things up…' : `Start my ${days}-day trial`}
      </Button>

      <p className="text-center text-[13px] leading-relaxed text-ink-dim">
        No card required. It stops on its own after {days} days — there is nothing to cancel.
      </p>
    </form>
  )
}
