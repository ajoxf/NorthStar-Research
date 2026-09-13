'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

export type TrialItem = {
  slug: string
  name: string
  kind: 'product' | 'section'
  trialEnabled: boolean
  /** Null means "use the house default". */
  trialDays: number | null
}

export type TrialState = {
  /** Applied to any item that has set no length of its own. */
  defaultDays: number
  grantable: TrialItem[]
  /** Whether a granted entitlement actually opens the product's own sign-in. */
  productAuthReady: boolean
}

/**
 * Free trials, one switch per product.
 *
 * It used to be a single global switch with a dropdown naming the one thing on offer,
 * which meant opening a trial of a second product closed the first — silently, with the
 * customer evaluating the first finding out by being refused at the door.
 *
 * The offers are independent. A member may hold a live trial of every product at once;
 * what they still cannot do is trial the same product twice, which is enforced on whether
 * an entitlement has EVER existed, expired ones included.
 *
 * Each switch is saved on its own. A batch save would make turning one trial on and
 * another off a single all-or-nothing write, and there is no reason those two decisions
 * should be able to fail together.
 */
export function TrialForm({ state }: { state: TrialState }) {
  const [items, setItems] = React.useState(state.grantable)
  const anyOpen = items.some((item) => item.trialEnabled)
  const openProducts = items.filter((item) => item.trialEnabled && item.kind === 'product')

  if (items.length === 0) {
    return (
      <p className="text-[14px] leading-relaxed text-ink-dim">
        There is nothing to offer yet. A trial grants an item, and none exist.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[14px] leading-relaxed text-ink-dim">
        One switch per product, each independent. A member can run a trial of every product
        at once, but only ever one trial of each — an expired trial still counts, so nobody
        renews a free month by waiting.
      </p>

      {!state.productAuthReady && openProducts.length > 0 && (
        <p className="rounded-lg border border-down/35 bg-down/10 px-3.5 py-2.5 text-[13px] leading-relaxed text-down">
          Product sign-in is not working, so a trial of{' '}
          {openProducts.map((item) => item.name).join(', ')} grants an entitlement that
          cannot open anything. Fix that before letting anybody in.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <TrialRow
            key={item.slug}
            item={item}
            defaultDays={state.defaultDays}
            onSaved={(next) =>
              setItems((all) => all.map((one) => (one.slug === next.slug ? next : one)))
            }
          />
        ))}
      </ul>

      {!anyOpen && (
        <p className="text-[13px] text-ink-dim">
          Every trial is closed. /trial returns a 404 and nothing advertises one.
        </p>
      )}
    </div>
  )
}

function TrialRow({
  item,
  defaultDays,
  onSaved,
}: {
  item: TrialItem
  defaultDays: number
  onSaved: (next: TrialItem) => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [days, setDays] = React.useState(item.trialDays === null ? '' : String(item.trialDays))
  const [pending, setPending] = React.useState(false)

  async function save(next: { enabled: boolean; days: string }) {
    setPending(true)
    try {
      const response = await fetch('/api/admin/trial', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemSlug: item.slug,
          enabled: next.enabled,
          // Blank means "use the house default" and is sent as null, not as zero — which
          // the server would clamp to a one-day trial nobody asked for.
          days: next.days.trim() === '' ? null : Number(next.days),
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast(data?.error ?? 'Could not save that.', 'error')
        return
      }
      onSaved({ ...item, trialEnabled: next.enabled, trialDays: data?.item?.trialDays ?? null })
      toast(
        next.enabled
          ? `${item.name}: trial open — ${data?.item?.trialDays ?? defaultDays} days`
          : `${item.name}: trial closed`,
      )
      router.refresh()
    } finally {
      setPending(false)
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-panel-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] text-ink">{item.name}</p>
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim">
          {item.kind === 'product' ? 'Platform' : 'Research'}
        </p>
      </div>

      <label className="flex items-center gap-2 text-[13px] text-ink-dim">
        <span>Days</span>
        <Input
          className="h-9 w-20"
          inputMode="numeric"
          value={days}
          placeholder={String(defaultDays)}
          onChange={(event) => setDays(event.target.value)}
          disabled={pending}
          aria-label={`Trial length for ${item.name}, in days`}
        />
      </label>

      <Button
        type="button"
        size="sm"
        variant={item.trialEnabled ? 'danger' : 'primary'}
        disabled={pending}
        onClick={() => save({ enabled: !item.trialEnabled, days })}
      >
        {pending && <Spinner />}
        {item.trialEnabled ? 'Close trial' : 'Open trial'}
      </Button>
    </li>
  )
}
