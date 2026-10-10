'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button, Spinner } from '@/components/ui/button'
import { Hint, Input, Label, Select } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { formatPrice } from '@/lib/package-shape'
import { MAX_PERCENT_OFF, MIN_PERCENT_OFF, discountedCents, offerLive } from '@/lib/offer'

export type OfferRow = {
  id: string
  name: string
  code: string | null
  percentOff: number
  duration: string
  startsAt: string | null
  endsAt: string | null
  maxRedemptions: number | null
  redeemedCount: number
  appliesToEverything: boolean
  archived: boolean
  sectionIds: string[]
  packageIds: string[]
}

export type Sellable = { id: string; name: string; priceCents: number; currency: string }

/**
 * Creating and stopping discounts.
 *
 * One screen for sales and codes, because they are one thing with one field different —
 * see the Offer model. The form says which it is in a single select rather than offering
 * two buttons that build the same row, so an operator never has to work out which of two
 * near-identical forms they are looking at.
 */
export function OfferManager({
  offers,
  sections,
  packages,
}: {
  offers: OfferRow[]
  sections: Sellable[]
  packages: Sellable[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [form, setForm] = React.useState(blankForm)

  async function send(url: string, method: string, body: unknown, success: string) {
    setBusy(true)
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast(data.error ?? 'That did not work.', 'error')
        return false
      }
      toast(success, 'success')
      router.refresh()
      return true
    } finally {
      setBusy(false)
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    const percentOff = Number(form.percentOff)
    if (!Number.isInteger(percentOff) || percentOff < MIN_PERCENT_OFF || percentOff > MAX_PERCENT_OFF) {
      toast(`Enter a whole number between ${MIN_PERCENT_OFF} and ${MAX_PERCENT_OFF}.`, 'error')
      return
    }
    const ok = await send(
      '/api/admin/offers',
      'POST',
      {
        name: form.name,
        code: form.kind === 'code' ? form.code : '',
        percentOff,
        duration: form.duration,
        // An empty date input sends ''; the API wants null for "no boundary".
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : null,
        appliesToEverything: form.appliesToEverything,
        sectionIds: form.appliesToEverything ? [] : form.sectionIds,
        packageIds: form.appliesToEverything ? [] : form.packageIds,
      },
      `${form.name} created`,
    )
    if (ok) {
      setForm(blankForm)
      setOpen(false)
    }
  }

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((value) => value !== id) : [...list, id]
  }

  /*
   * The example is live, because a percentage is not a price.
   *
   * "25% off" is a number nobody feels. Showing what it does to the cheapest and the
   * dearest thing it covers is what makes an operator notice that a quarter off the
   * institutional tier is ninety dollars a month before they publish it.
   */
  const covered = [
    ...sections.filter((s) => form.appliesToEverything || form.sectionIds.includes(s.id)),
    ...packages.filter((p) => form.appliesToEverything || form.packageIds.includes(p.id)),
  ]
  const percent = Number(form.percentOff)
  const example =
    covered.length > 0 && Number.isFinite(percent) && percent > 0
      ? covered
          .slice()
          .sort((a, b) => a.priceCents - b.priceCents)
          .filter((_, index, all) => index === 0 || index === all.length - 1)
      : []

  return (
    <section className="rounded-2xl border border-line bg-panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] text-ink">Discounts</h2>
          <p className="mt-1 max-w-2xl text-[16px] leading-relaxed text-ink-dim">
            A sale applies by itself and shows a reduced price wherever the thing is sold. A
            code only applies when somebody types it. Neither edits a price — the list price
            stays what it is, so ending a campaign puts it back by itself.
          </p>
        </div>
        <Button onClick={() => setOpen(!open)} disabled={busy}>
          <Plus size={16} /> New discount
        </Button>
      </div>

      {open && (
        <form onSubmit={create} className="mt-6 rounded-xl border border-line bg-panel-2 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="o-name">Campaign name</Label>
              <Input
                id="o-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Launch week"
                maxLength={80}
              />
              <Hint>Yours, for this list. A buyer never sees it.</Hint>
            </div>
            <div>
              <Label htmlFor="o-kind">How it applies</Label>
              <Select
                id="o-kind"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value as 'sale' | 'code' })}
              >
                <option value="sale">Public sale — everyone sees it</option>
                <option value="code">Code — only people who have it</option>
              </Select>
            </div>
          </div>

          {form.kind === 'code' && (
            <div className="mt-4">
              <Label htmlFor="o-code">Code</Label>
              <Input
                id="o-code"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                placeholder="LAUNCH25"
                maxLength={64}
              />
              <Hint>
                Case does not matter when somebody types it. Never shown on a public page —
                that is the whole difference between this and a sale.
              </Hint>
            </div>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="o-percent">Percent off</Label>
              <Input
                id="o-percent"
                value={form.percentOff}
                onChange={(e) => setForm({ ...form, percentOff: e.target.value })}
                inputMode="numeric"
                placeholder="25"
              />
            </div>
            <div>
              <Label htmlFor="o-duration">Applies to</Label>
              <Select
                id="o-duration"
                value={form.duration}
                onChange={(e) => setForm({ ...form, duration: e.target.value })}
              >
                <option value="first_payment">The first payment</option>
                <option value="forever">Every payment, while they stay</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="o-starts">Starts</Label>
              <Input
                id="o-starts"
                type="date"
                value={form.startsAt}
                onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              />
              <Hint>Blank starts now.</Hint>
            </div>
            <div>
              <Label htmlFor="o-ends">Ends</Label>
              <Input
                id="o-ends"
                type="date"
                value={form.endsAt}
                onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              />
              <Hint>Blank runs until you stop it.</Hint>
            </div>
          </div>

          <div className="mt-4">
            <Label htmlFor="o-max">Limit the number of uses</Label>
            <Input
              id="o-max"
              value={form.maxRedemptions}
              onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })}
              inputMode="numeric"
              placeholder="Leave blank for no limit"
              className="sm:max-w-[240px]"
            />
            <Hint>Counted from paid orders, so a checkout somebody abandoned does not use one up.</Hint>
          </div>

          <fieldset className="mt-5">
            <legend className="font-mono text-[12px] uppercase tracking-[0.18em] text-ink-dim">
              What it applies to
            </legend>
            {/*
              Nothing ticked discounts nothing, and that is on purpose. "No scope means
              everything" is the shape of the empty-package bug that gave away all-access,
              and the same inference here would discount the whole site. Forgetting has to
              cost a sale that did not happen, never revenue on every sale that did — so
              "everything" is a box somebody ticks.
            */}
            <label className="mt-3 flex items-start gap-3">
              <input
                type="checkbox"
                checked={form.appliesToEverything}
                onChange={(e) => setForm({ ...form, appliesToEverything: e.target.checked })}
                className="mt-1 h-4 w-4 accent-accent"
              />
              <span className="text-[16px] text-ink">Everything on sale</span>
            </label>

            {!form.appliesToEverything && (
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                <Picker
                  title="Sections"
                  items={sections}
                  selected={form.sectionIds}
                  onToggle={(id) => setForm({ ...form, sectionIds: toggle(form.sectionIds, id) })}
                />
                <Picker
                  title="Packages"
                  items={packages}
                  selected={form.packageIds}
                  onToggle={(id) => setForm({ ...form, packageIds: toggle(form.packageIds, id) })}
                />
              </div>
            )}
          </fieldset>

          {example.length > 0 && (
            <p className="mt-5 rounded-lg border border-line bg-panel px-4 py-3 text-[15px] leading-relaxed text-ink-dim">
              {example.map((item) => (
                <span key={item.id} className="block">
                  {item.name}:{' '}
                  <span className="text-ink-dim line-through">
                    {formatPrice(item.priceCents, item.currency)}
                  </span>{' '}
                  <span className="text-ink">
                    {formatPrice(discountedCents(item.priceCents, percent), item.currency)}
                  </span>
                </span>
              ))}
            </p>
          )}

          <div className="mt-5 flex gap-3">
            <Button type="submit" disabled={busy}>
              {busy && <Spinner />} Create discount
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {offers.length === 0 ? (
        <p className="mt-6 text-[16px] text-ink-dim">
          No discounts yet. Everything sells at its list price.
        </p>
      ) : (
        <ul className="mt-6 divide-y divide-line border-t border-line">
          {offers.map((offer) => (
            <OfferLine
              key={offer.id}
              offer={offer}
              sections={sections}
              packages={packages}
              busy={busy}
              onArchive={() =>
                send(
                  `/api/admin/offers/${offer.id}`,
                  'PATCH',
                  { action: offer.archived ? 'restore' : 'archive' },
                  offer.archived ? 'Discount restarted' : 'Discount stopped',
                )
              }
              onDelete={() => {
                if (!window.confirm(`Delete "${offer.name}"? Nothing has been bought under it.`)) return
                void send(`/api/admin/offers/${offer.id}`, 'DELETE', {}, 'Discount deleted')
              }}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function Picker({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string
  items: Sellable[]
  selected: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div>
      <p className="font-mono text-[12px] uppercase tracking-[0.18em] text-ink-dim">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-[15px] text-ink-dim">None on sale.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.includes(item.id)}
                  onChange={() => onToggle(item.id)}
                  className="mt-1 h-4 w-4 accent-accent"
                />
                <span className="text-[16px] text-ink">
                  {item.name}{' '}
                  <span className="font-mono text-[12px] text-ink-dim">
                    {formatPrice(item.priceCents, item.currency)}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function OfferLine({
  offer,
  sections,
  packages,
  busy,
  onArchive,
  onDelete,
}: {
  offer: OfferRow
  sections: Sellable[]
  packages: Sellable[]
  busy: boolean
  onArchive: () => void
  onDelete: () => void
}) {
  /*
   * "Running" is the same predicate the checkout uses, not a second reading of the dates.
   *
   * An operator looking at this list is asking exactly the question a buyer's checkout will
   * ask, and a status badge computed its own way is how a screen comes to say "live" about
   * a campaign that is quietly charging full price.
   */
  const running = offerLive(
    {
      ...offer,
      startsAt: offer.startsAt ? new Date(offer.startsAt) : null,
      endsAt: offer.endsAt ? new Date(offer.endsAt) : null,
      archivedAt: offer.archived ? new Date(0) : null,
      code: offer.code,
      duration: offer.duration === 'forever' ? 'forever' : 'first_payment',
    },
    new Date(),
  )

  const scope = offer.appliesToEverything
    ? 'Everything on sale'
    : [
        ...sections.filter((s) => offer.sectionIds.includes(s.id)).map((s) => s.name),
        ...packages.filter((p) => offer.packageIds.includes(p.id)).map((p) => p.name),
      ].join(', ') || 'Nothing selected — this discounts nothing'

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-[260px] flex-1">
        <span className="text-[17px] text-ink">{offer.name}</span>
        <span className="ml-2 font-mono text-[14px] text-accent-ink">{offer.percentOff}% off</span>
        {offer.code ? (
          <span className="ml-2 font-mono text-[12px] text-ink-dim">code {offer.code}</span>
        ) : (
          <span className="ml-2 font-mono text-[12px] text-ink-dim">public sale</span>
        )}
        <p className="mt-0.5 font-mono text-[12px] text-ink-dim">
          {scope} ·{' '}
          {offer.duration === 'forever' ? 'every payment' : 'first payment'} · {offer.redeemedCount}{' '}
          used
          {offer.maxRedemptions !== null && ` of ${offer.maxRedemptions}`}
          {offer.endsAt && ` · ends ${offer.endsAt.slice(0, 10)}`}
        </p>
      </div>
      {offer.archived ? (
        <Badge tone="muted">stopped</Badge>
      ) : running ? (
        <Badge tone="accent">running</Badge>
      ) : (
        <Badge tone="neutral">not running</Badge>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={busy} onClick={onArchive}>
          {offer.archived ? 'Restart' : 'Stop'}
        </Button>
        {offer.redeemedCount === 0 && (
          <Button size="sm" variant="danger" disabled={busy} onClick={onDelete}>
            Delete
          </Button>
        )}
      </div>
    </li>
  )
}

const blankForm = {
  name: '',
  kind: 'sale' as 'sale' | 'code',
  code: '',
  percentOff: '25',
  duration: 'first_payment',
  startsAt: '',
  endsAt: '',
  maxRedemptions: '',
  appliesToEverything: false,
  sectionIds: [] as string[],
  packageIds: [] as string[],
}
