'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ChevronDown, Plus, RotateCcw, Star, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label, Select, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import {
  type BillingIntervalValue,
  formatPrice,
  parseFeatures,
  parsePriceCents,
} from '@/lib/package-shape'

/**
 * Create, edit, archive and delete packages.
 *
 * Two things shape this screen.
 *
 * The first is that **the price shown here is not the price Stripe charges** — Stripe
 * charges what its own Price object says. So the Stripe price ID is a first-class field
 * with its own explanation, and the server checks it against Stripe before saving. A
 * package can be saved without one; it simply cannot then be bought by card, which the
 * row says plainly rather than failing at the last step of someone's checkout.
 *
 * The second is that **archive and delete are different things**, and the difference is
 * whether anybody bought it. Delete only appears on a package with no members and no
 * orders behind it — a draft. Everything else archives: withdrawn from sale, still
 * resolving for every member and order that points at it.
 */

export type AdminPackage = {
  id: string
  name: string
  slug: string
  description: string | null
  priceCents: number
  currency: string
  interval: BillingIntervalValue
  stripePriceId: string | null
  features: string[]
  sortOrder: number
  isDefault: boolean
  archived: boolean
  members: number
  orders: number
}

export function PackageManager({
  packages,
  stripeReady,
}: {
  packages: AdminPackage[]
  stripeReady: boolean
}) {
  const [creating, setCreating] = React.useState(false)

  const live = packages.filter((pkg) => !pkg.archived)
  const archived = packages.filter((pkg) => pkg.archived)

  return (
    <div>
      {live.length === 0 && (
        <div className="mb-6 rounded-lg border border-line bg-panel px-4 py-3.5 text-[14px] leading-relaxed text-ink-dim">
          No packages yet, so the site is selling the built-in plan — $199 a month, exactly as
          before. Creating your first package here replaces it everywhere.
        </div>
      )}

      <ul className="space-y-3">
        {live.map((pkg) => (
          <PackageRow key={pkg.id} pkg={pkg} stripeReady={stripeReady} onlyLive={live.length === 1} />
        ))}
      </ul>

      {creating ? (
        <div className="mt-4 rounded-lg border border-accent/40 bg-panel p-5">
          <h3 className="mb-4 text-[15px] text-ink">New package</h3>
          <PackageForm
            stripeReady={stripeReady}
            submitLabel="Create package"
            onCancel={() => setCreating(false)}
            onSubmit={async (body) => {
              const response = await fetch('/api/admin/packages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              })
              return response
            }}
            onDone={() => setCreating(false)}
          />
        </div>
      ) : (
        <Button variant="secondary" className="mt-4" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" aria-hidden />
          New package
        </Button>
      )}

      {archived.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-1 text-[17px] text-ink">Archived</h2>
          <p className="mb-4 max-w-2xl text-[14px] leading-relaxed text-ink-dim">
            Withdrawn from sale. Members already on these keep them, and every order still
            resolves — which is the point of archiving rather than deleting.
          </p>
          <ul className="space-y-3">
            {archived.map((pkg) => (
              <PackageRow key={pkg.id} pkg={pkg} stripeReady={stripeReady} onlyLive={false} />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function PackageRow({
  pkg,
  stripeReady,
  onlyLive,
}: {
  pkg: AdminPackage
  stripeReady: boolean
  onlyLive: boolean
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function act(body: unknown, method: 'PATCH' | 'DELETE', success: string) {
    setBusy(true)
    try {
      const response = await fetch(`/api/admin/packages/${pkg.id}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'DELETE' ? undefined : JSON.stringify(body),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast(data?.error ?? `Could not do that (HTTP ${response.status}).`, 'error')
        return
      }
      toast(success, 'success')
      router.refresh()
    } catch {
      toast('Could not reach the server.', 'error')
    } finally {
      setBusy(false)
    }
  }

  // Only a package nothing has ever referenced can be removed outright. Anything with a
  // member or an order behind it is a record of a purchase, and archiving keeps it.
  const deletable = pkg.members === 0 && pkg.orders === 0

  return (
    <li className="overflow-hidden rounded-lg border border-line bg-panel">
      {/*
        Stacked on a phone, side by side from `sm`. Wrapping the two columns instead
        leaves the text column a few characters wide once the action buttons have taken
        their space — the page does not overflow, it just renders one word per line.
      */}
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] text-ink">{pkg.name}</span>
            {pkg.isDefault && <Badge tone="accent">Default</Badge>}
            {pkg.archived && <Badge tone="muted">Archived</Badge>}
            {!pkg.stripePriceId && !pkg.archived && <Badge tone="neutral">Crypto only</Badge>}
          </div>

          <p className="mt-1 font-mono text-[13px] text-ink">
            {formatPrice(pkg.priceCents, pkg.currency)} / {pkg.interval}
          </p>

          {pkg.description && (
            <p className="mt-1 text-[13px] leading-relaxed text-ink-dim">{pkg.description}</p>
          )}

          <p className="mt-2 font-mono text-[11px] text-ink-dim">
            {pkg.members} member{pkg.members === 1 ? '' : 's'} · {pkg.orders} order
            {pkg.orders === 1 ? '' : 's'} · /join?package={pkg.slug}
          </p>

          {!pkg.stripePriceId && !pkg.archived && (
            <p className="mt-2 text-[13px] leading-relaxed text-ink-dim">
              No Stripe price, so card checkout will not offer this package — crypto still works.
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => setOpen((value) => !value)}>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden
            />
            Edit
          </Button>

          {!pkg.isDefault && !pkg.archived && (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => act({ action: 'make_default' }, 'PATCH', `${pkg.name} is now the default`)}
            >
              <Star className="h-3.5 w-3.5" aria-hidden />
              Make default
            </Button>
          )}

          {pkg.archived ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => act({ action: 'restore' }, 'PATCH', `${pkg.name} is back on sale`)}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Restore
            </Button>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || onlyLive}
              title={onlyLive ? 'This is the only package on sale.' : undefined}
              onClick={() => {
                if (!confirm(`Withdraw "${pkg.name}" from sale? Existing members keep it.`)) return
                void act({ action: 'archive' }, 'PATCH', `${pkg.name} withdrawn from sale`)
              }}
            >
              <Archive className="h-3.5 w-3.5" aria-hidden />
              Archive
            </Button>
          )}

          {deletable && (
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (!confirm(`Delete "${pkg.name}"? Nobody has bought it, so nothing is lost.`)) return
                void act(null, 'DELETE', `${pkg.name} deleted`)
              }}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Delete
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-line bg-panel-2 p-5">
          <PackageForm
            initial={pkg}
            stripeReady={stripeReady}
            submitLabel="Save changes"
            onCancel={() => setOpen(false)}
            onSubmit={(body) =>
              fetch(`/api/admin/packages/${pkg.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              })
            }
            onDone={() => setOpen(false)}
          />
        </div>
      )}
    </li>
  )
}

function PackageForm({
  initial,
  stripeReady,
  submitLabel,
  onSubmit,
  onCancel,
  onDone,
}: {
  initial?: AdminPackage
  stripeReady: boolean
  submitLabel: string
  onSubmit: (body: unknown) => Promise<Response>
  onCancel: () => void
  onDone: () => void
}) {
  const router = useRouter()
  const toast = useToast()

  const [name, setName] = React.useState(initial?.name ?? '')
  const [description, setDescription] = React.useState(initial?.description ?? '')
  const [price, setPrice] = React.useState(
    initial ? (initial.priceCents / 100).toFixed(2).replace(/\.00$/, '') : '',
  )
  const [interval, setInterval] = React.useState<BillingIntervalValue>(initial?.interval ?? 'month')
  const [sellByCard, setSellByCard] = React.useState(
    initial ? initial.stripePriceId !== null : stripeReady,
  )
  const [stripePriceId, setStripePriceId] = React.useState(initial?.stripePriceId ?? '')
  const [features, setFeatures] = React.useState((initial?.features ?? []).join('\n'))
  const [sortOrder, setSortOrder] = React.useState(String(initial?.sortOrder ?? 0))
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const cents = parsePriceCents(price)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)

    if (cents === null) {
      setError('Enter a price like 199 or 249.50 — digits only.')
      return
    }

    setPending(true)
    try {
      const response = await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        priceCents: cents,
        currency: 'USD',
        interval,
        sellByCard,
        stripePriceId: stripePriceId.trim() || null,
        features: parseFeatures(features),
        sortOrder: Number(sortOrder) || 0,
      })

      const data = await response.json().catch(() => null)
      if (!response.ok) {
        const message = data?.error ?? `Could not save (HTTP ${response.status}).`
        setError(message)
        toast(message, 'error')
        return
      }

      toast(initial ? 'Package updated' : 'Package created', 'success')
      onDone()
      router.refresh()
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor={`name-${initial?.id ?? 'new'}`}>Name</Label>
          <Input
            id={`name-${initial?.id ?? 'new'}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="NordStar Pro Membership"
            required
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor={`desc-${initial?.id ?? 'new'}`}>One-line description</Label>
          <Input
            id={`desc-${initial?.id ?? 'new'}`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="3 research reports per week"
          />
        </div>

        <div>
          <Label htmlFor={`price-${initial?.id ?? 'new'}`}>Price (USD)</Label>
          <Input
            id={`price-${initial?.id ?? 'new'}`}
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            placeholder="199"
            inputMode="decimal"
            required
          />
          <Hint>
            {cents === null
              ? 'Digits only — 199, or 249.50.'
              : `Shown as ${formatPrice(cents)} / ${interval}.`}
          </Hint>
        </div>

        <div>
          <Label htmlFor={`interval-${initial?.id ?? 'new'}`}>Billed every</Label>
          <Select
            id={`interval-${initial?.id ?? 'new'}`}
            value={interval}
            onChange={(event) => setInterval(event.target.value as BillingIntervalValue)}
          >
            <option value="month">Month</option>
            <option value="year">Year</option>
          </Select>
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-start gap-3 rounded-lg border border-line bg-panel-2 p-3.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#D0F53C]"
              checked={sellByCard}
              disabled={!stripeReady}
              onChange={(event) => setSellByCard(event.target.checked)}
            />
            <span className="min-w-0">
              <span className="block text-[14px] text-ink">Sell this by card (Stripe)</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-ink-dim">
                {stripeReady
                  ? 'A matching Stripe price is created for you when you save. Stripe prices cannot be ' +
                    'edited, so changing the amount always creates a new one and archives the old.'
                  : 'Stripe is not configured on this deployment, so card checkout is unavailable. ' +
                    'Crypto works without it.'}
              </span>
            </span>
          </label>
        </div>

        {/*
          Advanced, and last. Pasting an ID is the exception — an operator with a price
          they already use — so it sits below the toggle rather than being the control
          that has to be understood before a package can exist at all.
        */}
        {sellByCard && (
          <details className="sm:col-span-2">
            <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.14em] text-ink-dim hover:text-ink">
              Use an existing Stripe price
            </summary>
            <div className="mt-3">
              <Label htmlFor={`stripe-${initial?.id ?? 'new'}`}>Stripe price ID</Label>
              <Input
                id={`stripe-${initial?.id ?? 'new'}`}
                value={stripePriceId}
                onChange={(event) => setStripePriceId(event.target.value)}
                placeholder="price_1A2b3C…"
                autoComplete="off"
                spellCheck={false}
              />
              <Hint>
                Leave blank and one is created for you. Paste an ID to use a price you already
                have — it is checked against Stripe before saving, and refused if the amount,
                currency or interval disagree with the price above.
              </Hint>
            </div>
          </details>
        )}

        <div className="sm:col-span-2">
          <Label htmlFor={`features-${initial?.id ?? 'new'}`}>What it includes — one per line</Label>
          <Textarea
            id={`features-${initial?.id ?? 'new'}`}
            rows={4}
            value={features}
            onChange={(event) => setFeatures(event.target.value)}
            placeholder={'3 reports every week\nComplete archive access\nEmailed the moment each report lands'}
          />
          <Hint>These are the bullet points shown under the price on the join page.</Hint>
        </div>

        <div>
          <Label htmlFor={`order-${initial?.id ?? 'new'}`}>Display order</Label>
          <Input
            id={`order-${initial?.id ?? 'new'}`}
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
            inputMode="numeric"
          />
          <Hint>Lowest first on the join page.</Hint>
        </div>
      </div>

      <FieldError>{error}</FieldError>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {pending ? 'Saving…' : submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
