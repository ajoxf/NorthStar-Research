'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, MessageCircle } from 'lucide-react'

import { Button, ButtonLink, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

type MemberSettings = {
  billingProvider: 'stripe' | 'cregis' | 'manual' | null
  cancelAtPeriodEnd: boolean
  firstName: string | null
  lastName: string | null
  phoneNumber: string | null
  whatsappOptIn: boolean
  whatsappVerified: boolean
}

export function AccountForms({ member }: { member: MemberSettings }) {
  return (
    <>
      <BillingSection member={member} />
      <ProfileSection member={member} />
      <WhatsAppSection member={member} />
      <SignOutSection />
    </>
  )
}

function BillingSection({ member }: { member: MemberSettings }) {
  const toast = useToast()
  const [pending, setPending] = React.useState(false)

  async function openPortal() {
    setPending(true)
    try {
      const response = await fetch('/api/account/billing', { method: 'POST' })
      const data = await response.json()

      if (!response.ok) {
        toast(data.error ?? 'Could not open the billing portal.', 'error')
        return
      }
      window.location.href = data.url
    } catch {
      toast('Could not open the billing portal.', 'error')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="panel mt-5 p-6">
      <h2 className="eyebrow mb-5">Billing</h2>

      {member.billingProvider === 'stripe' ? (
        <>
          <p className="text-[15px] leading-relaxed text-ink-dim">
            {member.cancelAtPeriodEnd
              ? 'Your subscription is set to end at the close of the current period. You keep full access until then.'
              : 'Your $199/month membership renews automatically. Update your card or cancel any time — cancelling keeps your access until the end of the period you have paid for.'}
          </p>
          <Button variant="secondary" className="mt-5" onClick={openPortal} disabled={pending}>
            {pending ? (
              <>
                <Spinner />
                Opening…
              </>
            ) : (
              'Manage billing'
            )}
          </Button>
        </>
      ) : member.billingProvider === 'cregis' ? (
        <>
          {/* The honest version of "crypto subscription": there is nothing stored to
              charge, so renewal is a thing the member has to actually do. */}
          <p className="text-[15px] leading-relaxed text-ink-dim">
            You pay in crypto, which cannot renew automatically — there is no card on file for us to
            charge. We will email you a few days before your period ends. Paying again adds another
            month on top of whatever time you have left.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <ButtonLink href="/join">Renew now</ButtonLink>
            <ButtonLink href="/join" variant="secondary">
              Switch to card billing
            </ButtonLink>
          </div>
        </>
      ) : (
        <p className="text-[15px] leading-relaxed text-ink-dim">
          This account has no billing attached — it was set up directly by an administrator.
        </p>
      )}
    </section>
  )
}

function ProfileSection({ member }: { member: MemberSettings }) {
  const router = useRouter()
  const toast = useToast()
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(event.currentTarget)
    const newPassword = String(form.get('newPassword') ?? '')

    try {
      const response = await fetch('/api/account/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: String(form.get('firstName') ?? ''),
          lastName: String(form.get('lastName') ?? ''),
          currentPassword: String(form.get('currentPassword') ?? '') || undefined,
          newPassword: newPassword || undefined,
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'Your changes could not be saved.')
        return
      }

      toast('Settings saved', 'success')
      router.refresh()
    } catch {
      setError('Your changes could not be saved.')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="panel mt-5 p-6">
      <h2 className="eyebrow mb-5">Profile</h2>

      <form onSubmit={handleSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" name="firstName" defaultValue={member.firstName ?? ''} />
          </div>
          <div>
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" name="lastName" defaultValue={member.lastName ?? ''} />
          </div>
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <h3 className="mb-4 text-[15px] text-ink">Change password</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="currentPassword">Current password</Label>
              <Input
                id="currentPassword"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
              />
            </div>
            <div>
              <Label htmlFor="newPassword">New password</Label>
              <Input
                id="newPassword"
                name="newPassword"
                type="password"
                autoComplete="new-password"
              />
            </div>
          </div>
          <Hint>Leave both blank to keep your current password.</Hint>
        </div>

        <FieldError>{error}</FieldError>

        <Button type="submit" className="mt-6" disabled={pending}>
          {pending ? (
            <>
              <Spinner />
              Saving…
            </>
          ) : (
            'Save changes'
          )}
        </Button>
      </form>
    </section>
  )
}

function WhatsAppSection({ member }: { member: MemberSettings }) {
  const router = useRouter()
  const toast = useToast()

  const [phone, setPhone] = React.useState(member.phoneNumber ?? '')
  const [challenge, setChallenge] = React.useState<string | null>(null)
  const [code, setCode] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function startVerification(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)

    try {
      const response = await fetch('/api/account/whatsapp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: phone }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'We could not send the verification message.')
        return
      }

      setChallenge(data.challenge)
      toast('Verification code sent to WhatsApp', 'success')
    } catch {
      setError('We could not send the verification message.')
    } finally {
      setPending(false)
    }
  }

  async function confirmCode(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setPending(true)

    try {
      const response = await fetch('/api/account/whatsapp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge, code }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'That code is not correct.')
        return
      }

      setChallenge(null)
      setCode('')
      toast('WhatsApp delivery is on', 'success')
      router.refresh()
    } catch {
      setError('That code could not be checked.')
    } finally {
      setPending(false)
    }
  }

  async function turnOff() {
    setPending(true)
    try {
      await fetch('/api/account/whatsapp', { method: 'DELETE' })
      toast('WhatsApp delivery turned off', 'info')
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="panel mt-5 p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="eyebrow">WhatsApp delivery</h2>
        {member.whatsappOptIn && member.whatsappVerified && (
          <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-up">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            Active
          </span>
        )}
      </div>

      {member.whatsappOptIn && member.whatsappVerified ? (
        <div>
          <p className="text-[15px] leading-relaxed text-ink-dim">
            We send a link to each new report to{' '}
            <span className="font-mono text-ink">{member.phoneNumber}</span>. Messages contain a link
            into your portal, never the research itself.
          </p>
          <Button variant="secondary" className="mt-5" onClick={turnOff} disabled={pending}>
            Turn off WhatsApp delivery
          </Button>
        </div>
      ) : (
        <>
          {/* Deliberate edge state (§6): opted in, but the number is not confirmed, so
              nothing is being sent there yet. Say so plainly. */}
          {member.whatsappOptIn && !member.whatsappVerified && !challenge && (
            <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-accent/35 bg-accent/10 px-4 py-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
              <p className="text-[13px] leading-relaxed text-ink">
                You opted in during signup but your number has not been confirmed yet, so we are not
                sending anything to WhatsApp. Confirm it below to switch delivery on.
              </p>
            </div>
          )}

          {challenge ? (
            <form onSubmit={confirmCode} noValidate>
              <p className="mb-5 text-[15px] leading-relaxed text-ink-dim">
                We sent a 6-digit code to <span className="font-mono text-ink">{phone}</span> on
                WhatsApp. Enter it below.
              </p>

              <Label htmlFor="wa-code">Verification code</Label>
              <Input
                id="wa-code"
                value={code}
                inputMode="numeric"
                autoFocus
                maxLength={6}
                placeholder="000000"
                className="max-w-[180px] text-center font-mono text-lg tracking-[0.3em]"
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
              />
              <FieldError>{error}</FieldError>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button type="submit" disabled={pending || code.length < 6}>
                  {pending ? (
                    <>
                      <Spinner />
                      Checking…
                    </>
                  ) : (
                    'Confirm number'
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setChallenge(null)
                    setError(null)
                  }}
                >
                  Use a different number
                </Button>
              </div>
            </form>
          ) : (
            <form onSubmit={startVerification} noValidate>
              <div className="mb-5 flex items-start gap-2.5">
                <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                <p className="text-[15px] leading-relaxed text-ink-dim">
                  Get a link to each new report on WhatsApp as well as by email. We will send a code
                  to confirm the number is yours.
                </p>
              </div>

              <Label htmlFor="wa-phone">Phone number</Label>
              <Input
                id="wa-phone"
                type="tel"
                value={phone}
                autoComplete="tel"
                placeholder="+1 555 000 0000"
                onChange={(event) => setPhone(event.target.value)}
              />
              <FieldError>{error}</FieldError>
              <Hint>Include the country code.</Hint>

              <Button type="submit" className="mt-5" disabled={pending || phone.trim().length < 6}>
                {pending ? (
                  <>
                    <Spinner />
                    Sending…
                  </>
                ) : (
                  'Send verification code'
                )}
              </Button>
            </form>
          )}
        </>
      )}
    </section>
  )
}

function SignOutSection() {
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function signOut() {
    setPending(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/')
    router.refresh()
  }

  return (
    <section className="mt-5 flex justify-end">
      <Button variant="ghost" onClick={signOut} disabled={pending}>
        {pending ? 'Signing out…' : 'Sign out'}
      </Button>
    </section>
  )
}
