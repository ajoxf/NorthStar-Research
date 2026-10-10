'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'

import { Button, Spinner } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

export type TrialItem = {
  slug: string
  name: string
  /**
   * `research` is the membership this site sells, which is not an item at all — it is two
   * columns on the member record. It appears in this list because an operator thinks of it
   * as one more thing they can put on trial, and where the switch is stored is not their
   * problem.
   */
  kind: 'product' | 'section' | 'research'
  trialEnabled: boolean
  /** Null means "use the default below". */
  trialDays: number | null
  /**
   * What a blank box actually gives THIS row.
   *
   * Per row rather than one figure for the table, because the two kinds do not share a
   * default: a section falls back to the house setting an operator can change, and the
   * membership falls back to a fortnight fixed in code. One placeholder for both was a
   * box that promised a number the save would not use.
   */
  defaultDays: number
}

export type TrialState = {
  grantable: TrialItem[]
  /** Whether a section created from now on starts with its trial open. */
  newSectionsOpen: boolean
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
  const closedSections = items.filter((item) => item.kind === 'section' && !item.trialEnabled)

  if (items.length === 0) {
    return (
      <p className="text-[16px] leading-relaxed text-ink-dim">
        There is nothing to offer yet.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[16px] leading-relaxed text-ink-dim">
        One switch each, independent. A member can run a trial of the membership and of a
        section at once, but only ever one trial of each — an expired trial still counts, so
        nobody renews a free month by waiting.
      </p>

      <SectionDefaults
        initial={state.newSectionsOpen}
        closedCount={closedSections.length}
        onOpenedAll={() =>
          setItems((all) =>
            all.map((item) => (item.kind === 'section' ? { ...item, trialEnabled: true } : item)),
          )
        }
      />

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <TrialRow
            key={item.slug}
            item={item}
            onSaved={(next) =>
              setItems((all) => all.map((one) => (one.slug === next.slug ? next : one)))
            }
          />
        ))}
      </ul>

      {!anyOpen && (
        <p className="text-[15px] text-ink-dim">
          Every trial is closed. /trial returns a 404 and nothing advertises one.
        </p>
      )}
    </div>
  )
}

/**
 * The two house-level controls for section trials.
 *
 * The default only decides what a section created from now on starts with. Turning every
 * existing section on is a separate button with a confirmation, because a setting that
 * silently began giving away products already on sale would be a decision made by a side
 * effect.
 */
function SectionDefaults({
  initial,
  closedCount,
  onOpenedAll,
}: {
  initial: boolean
  closedCount: number
  onOpenedAll: () => void
}) {
  const router = useRouter()
  const toast = useToast()
  const [newSectionsOpen, setNewSectionsOpen] = React.useState(initial)
  const [pending, setPending] = React.useState<'default' | 'all' | null>(null)

  async function saveDefault(next: boolean) {
    // Ticked at once and put back if the save fails, so the box answers the click rather
    // than sitting unchanged until the server does.
    setNewSectionsOpen(next)
    setPending('default')
    try {
      const response = await fetch('/api/admin/trial/sections', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newSectionsOpen: next }),
      }).catch(() => null)
      const data = await response?.json().catch(() => null)
      if (!response?.ok) {
        setNewSectionsOpen(!next)
        toast(data?.error ?? 'Could not save that.', 'error')
        return
      }
      toast(next ? 'New sections will start with a trial open' : 'New sections will start closed')
    } finally {
      setPending(null)
    }
  }

  async function openAll() {
    const ok = window.confirm(
      `Open the free trial on ${closedCount} section${closedCount === 1 ? '' : 's'} without ` +
        'one? Each keeps its own trial length, and any can be closed again below.',
    )
    if (!ok) return
    setPending('all')
    try {
      const response = await fetch('/api/admin/trial/sections', { method: 'POST' })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast(data?.error ?? 'Could not open them.', 'error')
        return
      }
      onOpenedAll()
      toast(`Trial opened on ${data?.opened ?? 0} section${data?.opened === 1 ? '' : 's'}`)
      router.refresh()
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-panel-2 px-4 py-3">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-accent"
          checked={newSectionsOpen}
          disabled={pending !== null}
          onChange={(event) => saveDefault(event.target.checked)}
        />
        <span>
          <span className="block text-[16px] text-ink">New sections start with a trial open</span>
          <span className="block text-[15px] leading-relaxed text-ink-dim">
            Applies when a section is created. Sections that already exist keep whatever
            they are set to.
          </span>
        </span>
      </label>

      {closedCount > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
          <p className="min-w-0 flex-1 text-[15px] text-ink-dim">
            {closedCount} section{closedCount === 1 ? ' has' : 's have'} no trial open.
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending !== null}
            onClick={openAll}
          >
            {pending === 'all' && <Spinner />}
            Open trials on every section
          </Button>
        </div>
      )}
    </div>
  )
}

function TrialRow({ item, onSaved }: { item: TrialItem; onSaved: (next: TrialItem) => void }) {
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
          ? `${item.name}: trial open — ${data?.item?.trialDays ?? item.defaultDays} days`
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
        <p className="truncate text-[17px] text-ink">{item.name}</p>
        <p className="font-mono text-[12px] uppercase tracking-[0.14em] text-ink-dim">
          {item.kind === 'product' ? 'Platform' : item.kind === 'research' ? 'Membership' : 'Section'}
        </p>
      </div>

      <label className="flex items-center gap-2 text-[15px] text-ink-dim">
        <span>Days</span>
        <Input
          className="h-9 w-20"
          inputMode="numeric"
          value={days}
          placeholder={String(item.defaultDays)}
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
