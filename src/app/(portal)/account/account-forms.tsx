'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button, ButtonLink, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label } from '@/components/ui/field'
import { PasswordInput } from '@/components/ui/password-input'
import { useToast } from '@/components/ui/toast'

type MemberSettings = {
  billingProvider: 'stripe' | 'cregis' | 'manual' | null
  cancelAtPeriodEnd: boolean
  firstName: string | null
  lastName: string | null
  phoneNumber: string | null
}

export function AccountForms({ member }: { member: MemberSettings }) {
  return (
    <>
      <BillingSection member={member} />
      <ProfileSection member={member} />
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
          phoneNumber: String(form.get('phoneNumber') ?? ''),
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

        {/*
          Phone number is a contact detail on your member record — the desk may use it to
          reach you. Reports are delivered by email only; nothing is sent to this number.
        */}
        <div className="mt-4">
          <Label htmlFor="phoneNumber">Phone number (optional)</Label>
          <Input
            id="phoneNumber"
            name="phoneNumber"
            type="tel"
            autoComplete="tel"
            placeholder="+1 555 000 0000"
            defaultValue={member.phoneNumber ?? ''}
          />
          <Hint>Include the country code. Reports are delivered by email only.</Hint>
        </div>

        <div className="mt-6 border-t border-line pt-5">
          <h3 className="mb-4 text-[15px] text-ink">Change password</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="currentPassword">Current password</Label>
              <PasswordInput
                id="currentPassword"
                name="currentPassword"
                autoComplete="current-password"
              />
            </div>
            <div>
              <Label htmlFor="newPassword">New password</Label>
              <PasswordInput
                id="newPassword"
                name="newPassword"
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
