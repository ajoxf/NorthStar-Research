'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { normaliseSlug } from '@/lib/affiliates'

const REWARDS = [
  { value: 'percent', label: '% of first payment', hint: 'Percent, 0–100' },
  { value: 'fixed', label: 'Fixed $ per sale', hint: 'Whole US dollars' },
  { value: 'free_months', label: 'Free months', hint: 'Months of membership' },
] as const

/**
 * Create an affiliate.
 *
 * The slug preview updates as you type because the slug is the one field that cannot be
 * changed afterwards — it ends up in bios, videos and posts the affiliate cannot revise,
 * so it is better to see it before committing than to discover it later.
 */
export function AffiliateCreator() {
  const router = useRouter()
  const toast = useToast()

  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState('')
  const [slug, setSlug] = React.useState('')
  const [rewardKind, setRewardKind] = React.useState<(typeof REWARDS)[number]['value']>('percent')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const effectiveSlug = normaliseSlug(slug || name)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)

    const form = new FormData(event.currentTarget)
    const discount = Number(form.get('visitorDiscountPercent') ?? 0)

    try {
      const response = await fetch('/api/admin/affiliates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(form.get('name') ?? ''),
          email: String(form.get('email') ?? ''),
          slug: String(form.get('slug') ?? ''),
          rewardKind,
          rewardAmount: Number(form.get('rewardAmount') ?? 0),
          visitorDiscountPercent: discount > 0 ? discount : null,
          notes: String(form.get('notes') ?? ''),
        }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'The affiliate could not be created.')
        return
      }

      toast(`Affiliate created — /join?ref=${data.slug}`, 'success')
      setOpen(false)
      setName('')
      setSlug('')
      router.refresh()
    } catch {
      setError('The affiliate could not be created.')
    } finally {
      setPending(false)
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="w-full sm:w-auto">
        Add an affiliate
      </Button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="panel p-5 sm:p-6" noValidate>
      <h2 className="mb-5 text-[17px] text-ink">New affiliate</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="af-name">Name</Label>
          <Input
            id="af-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="af-email">Email</Label>
          <Input id="af-email" name="email" type="email" autoComplete="off" required />
          <Hint>Where you will reach them about what they are owed.</Hint>
        </div>
      </div>

      <div className="mt-4">
        <Label htmlFor="af-slug">Link slug — optional</Label>
        <Input
          id="af-slug"
          name="slug"
          value={slug}
          placeholder={normaliseSlug(name) || 'derived-from-name'}
          onChange={(event) => setSlug(event.target.value)}
        />
        <Hint>
          {effectiveSlug ? (
            <>
              Their link will be <span className="font-mono text-ink">/join?ref={effectiveSlug}</span>
              . This cannot be changed later — it ends up in posts they cannot edit.
            </>
          ) : (
            'Lowercase letters, numbers and dashes.'
          )}
        </Hint>
      </div>

      <div className="mt-6 border-t border-line pt-5">
        <Label htmlFor="af-reward-kind">Reward</Label>
        <div className="mt-2 flex flex-wrap gap-2">
          {REWARDS.map((reward) => (
            <button
              key={reward.value}
              type="button"
              onClick={() => setRewardKind(reward.value)}
              className={`h-10 rounded-full border px-4 text-[13px] transition-colors ${
                rewardKind === reward.value
                  ? 'border-accent bg-accent/10 text-ink'
                  : 'border-line text-ink-dim hover:text-ink'
              }`}
            >
              {reward.label}
            </button>
          ))}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="af-reward-amount">Amount</Label>
            <Input
              id="af-reward-amount"
              name="rewardAmount"
              type="number"
              min={0}
              defaultValue={20}
              required
            />
            <Hint>{REWARDS.find((r) => r.value === rewardKind)?.hint}</Hint>
          </div>
          <div>
            <Label htmlFor="af-discount">Visitor discount — optional</Label>
            <Input id="af-discount" name="visitorDiscountPercent" type="number" min={0} max={100} />
            <Hint>Percent off the first payment for people using their link. 100 is free.</Hint>
          </div>
        </div>
      </div>

      <div className="mt-4">
        <Label htmlFor="af-notes">Notes — optional</Label>
        <Input id="af-notes" name="notes" placeholder="Where they promote, terms agreed…" />
      </div>

      <FieldError>{error}</FieldError>

      <div className="mt-6 flex flex-wrap gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <>
              <Spinner />
              Creating…
            </>
          ) : (
            'Create affiliate'
          )}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
