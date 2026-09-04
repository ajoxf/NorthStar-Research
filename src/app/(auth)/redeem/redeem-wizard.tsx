'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Check, CheckCircle2 } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { useToast } from '@/components/ui/toast'
import { cn, isValidEmail } from '@/lib/utils'

/**
 * Three-step guided activation (build spec §6): code → account details → done.
 *
 * The middle step is where a new member forms their first impression of a $199/month product,
 * so it validates inline, keeps state between steps, and confirms the accepted code
 * visibly rather than silently moving on.
 */

const STEPS = ['Access code', 'Your account', 'Done'] as const

export function RedeemWizard({
  initialCode,
  next = null,
}: {
  initialCode: string
  next?: string | null
}) {
  const router = useRouter()
  const toast = useToast()

  const [step, setStep] = React.useState(0)
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const [code, setCode] = React.useState(initialCode)
  const [email, setEmail] = React.useState('')
  const [firstName, setFirstName] = React.useState('')
  const [lastName, setLastName] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [phoneNumber, setPhoneNumber] = React.useState('')
  const [whatsappSameAsPhone, setWhatsappSameAsPhone] = React.useState(true)
  const [whatsappNumber, setWhatsappNumber] = React.useState('')

  async function validateCode(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)

    try {
      const response = await fetch('/api/redeem/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'That code could not be verified.')
        return
      }

      setCode(data.code)
      if (data.email) setEmail(data.email)
      toast('Code accepted', 'success')
      setStep(1)
    } catch {
      setError('We could not verify your code. Please try again.')
    } finally {
      setPending(false)
    }
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (!isValidEmail(email)) {
      setError('Enter a valid email address.')
      return
    }
    if (password.length < 10) {
      setError('Choose a password of at least 10 characters.')
      return
    }

    setPending(true)
    try {
      const response = await fetch('/api/redeem/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          email,
          password,
          next,
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          phoneNumber,
          whatsappSameAsPhone,
          whatsappNumber: whatsappSameAsPhone ? undefined : whatsappNumber,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'We could not activate your membership.')
        return
      }

      setStep(2)
      toast('Membership activated', 'success')
      // Brief pause so the confirmation state is actually seen, then straight in.
      setTimeout(() => {
        // The server decides the destination: it validates `next` and falls back to the
        // dashboard, so a tampered link cannot bounce a new member off-site.
        router.push(data.redirectTo ?? '/dashboard')
        router.refresh()
      }, 1600)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div>
      <Stepper current={step} />

      {step === 0 && (
        <form onSubmit={validateCode} className="mt-8" noValidate>
          <h1 className="text-3xl text-ink">Activate your membership</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
            Enter the access code we emailed you after your payment confirmed.
          </p>

          <div className="mt-7">
            <Label htmlFor="code">Access code</Label>
            <Input
              id="code"
              value={code}
              autoFocus
              spellCheck={false}
              autoCapitalize="characters"
              placeholder="NSR-XXXX-XXXX"
              className="text-center font-mono text-lg tracking-[0.2em]"
              onChange={(event) => setCode(event.target.value)}
              required
            />
            <FieldError>{error}</FieldError>
            <Hint>Codes look like NSR-4KFP-9TQX and can only be redeemed once.</Hint>
          </div>

          <Button type="submit" size="lg" className="mt-6 w-full" disabled={pending || !code.trim()}>
            {pending ? (
              <>
                <Spinner />
                Checking…
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4" aria-hidden />
              </>
            )}
          </Button>
        </form>
      )}

      {step === 1 && (
        <form onSubmit={createAccount} className="mt-8" noValidate>
          <div className="mb-6 flex items-center gap-2.5 rounded-lg border border-up/30 bg-up/10 px-4 py-3">
            <Check className="h-4 w-4 shrink-0 text-up" aria-hidden />
            <p className="text-[14px] text-ink">
              Code <span className="font-mono text-up">{code}</span> accepted
            </p>
          </div>

          <h1 className="text-3xl text-ink">Create your account</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
            This is how you will sign in to read your reports.
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="firstName">First name</Label>
              <Input
                id="firstName"
                value={firstName}
                autoComplete="given-name"
                onChange={(event) => setFirstName(event.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="lastName">Last name</Label>
              <Input
                id="lastName"
                value={lastName}
                autoComplete="family-name"
                onChange={(event) => setLastName(event.target.value)}
              />
            </div>
          </div>

          <div className="mt-4">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>

          <div className="mt-4">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              value={password}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <PasswordStrength value={password} />
          </div>

          {/*
            Contact detail on the member record, not a delivery channel. Reports go by
            email only, so asking for this must not imply messages are coming — hence the
            hint below, which also repeats the anti-impersonation line the emails carry.
          */}
          <div className="mt-4">
            <Label htmlFor="phone">Mobile number</Label>
            <Input
              id="phone"
              type="tel"
              value={phoneNumber}
              autoComplete="tel"
              placeholder="+1 555 000 0000"
              required
              onChange={(event) => setPhoneNumber(event.target.value)}
            />
            <Hint>
              Include the country code. This is so we can reach you about your membership —
              reports are delivered by email, and we will never message you first to ask for
              money or offer to manage an account.
            </Hint>
          </div>

          {/*
            Two questions, not one. The old field asked for "WhatsApp or phone" and got a
            single number with no record of which it was, so the desk could not tell
            whether it was reachable on WhatsApp without trying it. The common case — one
            line for both — stays a single tick rather than typing the number twice.
          */}
          <div className="mt-4">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#D0F53C]"
                checked={whatsappSameAsPhone}
                onChange={(event) => setWhatsappSameAsPhone(event.target.checked)}
              />
              <span className="text-[14px] leading-relaxed text-ink-dim">
                WhatsApp is on this same number
              </span>
            </label>

            {!whatsappSameAsPhone && (
              <div className="mt-3 animate-fade-up">
                <Label htmlFor="whatsapp">WhatsApp number</Label>
                <Input
                  id="whatsapp"
                  type="tel"
                  value={whatsappNumber}
                  autoComplete="tel"
                  placeholder="+1 555 000 0000"
                  onChange={(event) => setWhatsappNumber(event.target.value)}
                />
                <Hint>Leave blank if you would rather not give one.</Hint>
              </div>
            )}
          </div>

          <FieldError>{error}</FieldError>

          <Button type="submit" size="lg" className="mt-6 w-full" disabled={pending}>
            {pending ? (
              <>
                <Spinner />
                Activating…
              </>
            ) : (
              'Activate membership'
            )}
          </Button>

          <button
            type="button"
            onClick={() => {
              setStep(0)
              setError(null)
            }}
            className="mt-4 w-full text-center text-[13px] text-ink-dim transition-colors hover:text-ink"
          >
            Use a different code
          </button>
        </form>
      )}

      {step === 2 && (
        <div className="mt-10 animate-fade-up text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-full border border-up/40 bg-up/10">
            <CheckCircle2 className="h-7 w-7 text-up" aria-hidden />
          </div>
          <h1 className="text-3xl text-ink">You&apos;re in</h1>
          <p className="mx-auto mt-4 max-w-xs text-[15px] leading-relaxed text-ink-dim">
            Your membership is active. Taking you to your reports…
          </p>
          <div className="mt-6 flex justify-center">
            <Spinner className="text-accent" />
          </div>
        </div>
      )}
    </div>
  )
}

function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2" aria-label="Progress">
      {STEPS.map((label, index) => (
        <li key={label} className="flex flex-1 items-center gap-2">
          <div className="flex-1">
            <div
              className={cn(
                'h-0.5 rounded-full transition-colors duration-300',
                index <= current ? 'bg-accent' : 'bg-line',
              )}
            />
            <span
              className={cn(
                'mt-2 block font-mono text-[10px] uppercase tracking-[0.14em] transition-colors',
                index <= current ? 'text-accent' : 'text-ink-dim/60',
              )}
            >
              {label}
            </span>
          </div>
        </li>
      ))}
    </ol>
  )
}

function PasswordStrength({ value }: { value: string }) {
  const checks = [
    { label: '10+ characters', ok: value.length >= 10 },
    { label: 'A number', ok: /\d/.test(value) },
    { label: 'A letter', ok: /[a-zA-Z]/.test(value) },
  ]

  if (!value) {
    return <Hint>At least 10 characters. A passphrase works well.</Hint>
  }

  return (
    <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {checks.map((check) => (
        <li
          key={check.label}
          className={cn(
            'flex items-center gap-1.5 text-[12px] transition-colors',
            check.ok ? 'text-up' : 'text-ink-dim',
          )}
        >
          <Check className={cn('h-3 w-3', !check.ok && 'opacity-30')} aria-hidden />
          {check.label}
        </li>
      ))}
    </ul>
  )
}
