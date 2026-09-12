'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { Input, Label, Select } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

export type TrialState = {
  enabled: boolean
  days: number
  itemSlug: string
  grantable: { slug: string; name: string; kind: 'product' | 'section' }[]
  /** Whether a granted entitlement actually opens the product's own sign-in. */
  productAuthReady: boolean
}

/**
 * Whether anyone can start a free trial, of what, and for how long.
 *
 * The switch is the whole point of this form: the signup page does not exist while trials
 * are off — it returns a 404 rather than a disabled form — and the product cards on the
 * homepage advertise the trial only while it is on. So this one control is the difference
 * between a site with a public sign-up and a site without one.
 */
export function TrialForm({ state }: { state: TrialState }) {
  const router = useRouter()
  const toast = useToast()
  const [enabled, setEnabled] = React.useState(state.enabled)
  const [days, setDays] = React.useState(String(state.days))
  const [itemSlug, setItemSlug] = React.useState(state.itemSlug)
  const [pending, setPending] = React.useState(false)

  const products = state.grantable.filter((entry) => entry.kind === 'product')
  const sections = state.grantable.filter((entry) => entry.kind === 'section')
  const nothingToGrant = state.grantable.length === 0
  const grantingSection = sections.some((entry) => entry.slug === itemSlug)

  async function save(next: { enabled: boolean }) {
    setPending(true)
    try {
      const response = await fetch('/api/admin/trial', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: next.enabled,
          days: Number(days) || state.days,
          itemSlug,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast(data?.error ?? 'Could not save that.', 'error')
        return
      }
      setEnabled(next.enabled)
      if (data?.settings) setDays(String(data.settings.days))
      toast(
        next.enabled ? `Free trials are open — ${data?.settings?.days ?? days} days` : 'Free trials are closed',
        'success',
      )
      router.refresh()
    } catch {
      toast('Could not reach the server.', 'error')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div>
          <span className="flex items-center gap-2 text-[15px] text-ink">
            {enabled ? 'Open' : 'Closed'}
            {enabled && (
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-accent">
                live
              </span>
            )}
          </span>
          <span className="mt-1 block text-[13px] leading-relaxed text-ink-dim">
            {enabled
              ? 'Anyone can sign up at /trial with an email and a password. No card, no code.'
              : 'There is no public sign-up. /trial returns a 404 and the homepage advertises no trial.'}
          </span>
        </div>

        <Button
          type="button"
          variant={enabled ? 'secondary' : 'primary'}
          disabled={pending || nothingToGrant}
          onClick={() => save({ enabled: !enabled })}
        >
          {pending && <Spinner />}
          {enabled ? 'Close trials' : 'Open trials'}
        </Button>
      </div>

      <div className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="trial-item">What it grants</Label>
          <Select
            id="trial-item"
            value={itemSlug}
            disabled={nothingToGrant}
            onChange={(event) => setItemSlug(event.target.value)}
          >
            {nothingToGrant && <option value={itemSlug}>Nothing to grant yet</option>}
            {products.length > 0 && (
              <optgroup label="Products">
                {products.map((entry) => (
                  <option key={entry.slug} value={entry.slug}>
                    {entry.name}
                  </option>
                ))}
              </optgroup>
            )}
            {sections.length > 0 && (
              <optgroup label="Research sections">
                {sections.map((entry) => (
                  <option key={entry.slug} value={entry.slug}>
                    {entry.name}
                  </option>
                ))}
              </optgroup>
            )}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="trial-days">How long</Label>
          <div className="flex items-center gap-2">
            <Input
              id="trial-days"
              type="number"
              min={1}
              max={365}
              value={days}
              onChange={(event) => setDays(event.target.value)}
              className="w-24"
            />
            <span className="text-[14px] text-ink-dim">days</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={pending || nothingToGrant}
          onClick={() => save({ enabled })}
        >
          {pending && <Spinner />}
          Save
        </Button>
        <span className="text-[13px] text-ink-dim">
          Changing these does not shorten a trial somebody is already on.
        </span>
      </div>

      {grantingSection && (
        <p className="mt-4 rounded-lg border border-line bg-panel-2 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-dim">
          A research section, not software. The trialist reads that section's reports for the
          period and keeps whatever they have read — unlike a product, which stops being useful
          the day access ends. They get that section only: no other section, and none of the
          untagged back catalogue.
        </p>
      )}

      {enabled && !grantingSection && !state.productAuthReady && (
        <p className="mt-4 rounded-lg border border-down/35 bg-down/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink">
          Trials are open, but the sign-in bridge is not configured — so a trialist gets an
          entitlement here and cannot sign into the product. Set RAMP_SUPABASE_URL and
          RAMP_SUPABASE_SECRET_KEY in Vercel, then redeploy. Everyone who signed up in the
          meantime is connected by the nightly job.
        </p>
      )}

      {nothingToGrant && (
        <p className="mt-4 text-[13px] leading-relaxed text-down">
          Nothing exists yet that a trial could grant. Run the item backfill first.
        </p>
      )}
    </div>
  )
}
