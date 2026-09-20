'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ChevronDown, Plus, RotateCcw, Star, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label, Select, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { SectionImageField } from '@/app/admin/sections/image-field'
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
  imageUrl: string | null
  offerToMembers: boolean
  sortOrder: number
  isDefault: boolean
  archived: boolean
  members: number
  orders: number
  /** Whose package this is. Null is the house membership. */
  authorId: string | null
  trialEnabled: boolean
  trialDays: number | null
  /** How many live sections this package would actually open. Zero means a trial grants nothing. */
  grantableItems: number
  /** What this package currently grants. */
  itemIds: string[]
}

export type ItemOption = { id: string; name: string; kind: 'section' | 'product'; archived: boolean }

export type AuthorOption = { id: string; name: string }

export function PackageManager({
  packages,
  authors,
  items,
  stripeReady,
}: {
  packages: AdminPackage[]
  /** Every contributor a package can be attributed to. Empty until any exist. */
  authors: AuthorOption[]
  /** Everything a package can grant. */
  items: ItemOption[]
  stripeReady: boolean
}) {
  const [creating, setCreating] = React.useState(false)

  const live = packages.filter((pkg) => !pkg.archived)
  const archived = packages.filter((pkg) => pkg.archived)

  /*
   * Grouped by whose it is, once there is more than one seller on the site.
   *
   * Below that threshold the grouping is noise — one heading over the only list there
   * is — so the flat list stays exactly as it was until contributors actually exist.
   */
  const byAuthor = authors
    .map((author) => ({ author, rows: live.filter((pkg) => pkg.authorId === author.id) }))
    .filter((group) => group.rows.length > 0)

  const houseIds = new Set(byAuthor.flatMap((group) => group.rows.map((row) => row.id)))
  const house = live.filter((pkg) => !houseIds.has(pkg.id))

  return (
    <div>
      {live.length === 0 && (
        <div className="mb-6 rounded-lg border border-line bg-panel px-4 py-3.5 text-[14px] leading-relaxed text-ink-dim">
          No packages yet, so the site is selling the built-in plan — $199 a month, exactly as
          before. Creating your first package here replaces it everywhere.
        </div>
      )}

      {byAuthor.length === 0 ? (
        <ul className="space-y-3">
          {live.map((pkg) => (
            <PackageRow
              key={pkg.id}
              pkg={pkg}
              authors={authors}
              items={items}
              stripeReady={stripeReady}
              onlyLive={live.length === 1}
            />
          ))}
        </ul>
      ) : (
        <div className="space-y-8">
          {house.length > 0 && (
            <section>
              <h2 className="mb-1 text-[15px] text-ink">The house</h2>
              <p className="mb-3 text-[13px] leading-relaxed text-ink-dim">
                Not attributed to any one contributor — the whole-site membership and anything
                spanning several people.
              </p>
              <ul className="space-y-3">
                {house.map((pkg) => (
                  <PackageRow
                    key={pkg.id}
                    pkg={pkg}
                    authors={authors}
                    items={items}
                    stripeReady={stripeReady}
                    onlyLive={live.length === 1}
                  />
                ))}
              </ul>
            </section>
          )}

          {byAuthor.map((group) => (
            <section key={group.author.id}>
              <h2 className="mb-1 text-[15px] text-ink">{group.author.name}</h2>
              <p className="mb-3 text-[13px] leading-relaxed text-ink-dim">
                Shown on this contributor&rsquo;s own page. One author per package, so what they
                are owed is a sum of these rather than a split of somebody else&rsquo;s.
              </p>
              <ul className="space-y-3">
                {group.rows.map((pkg) => (
                  <PackageRow
                    key={pkg.id}
                    pkg={pkg}
                    authors={authors}
                    items={items}
                    stripeReady={stripeReady}
                    onlyLive={live.length === 1}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {creating ? (
        <div className="mt-4 rounded-lg border border-accent/40 bg-panel p-5">
          <h3 className="mb-4 text-[15px] text-ink">New package</h3>
          <PackageForm
            authors={authors}
            items={items}
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
              <PackageRow
                key={pkg.id}
                pkg={pkg}
                authors={authors}
                items={items}
                stripeReady={stripeReady}
                onlyLive={false}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function PackageRow({
  pkg,
  authors,
  items,
  stripeReady,
  onlyLive,
}: {
  pkg: AdminPackage
  authors: AuthorOption[]
  items: ItemOption[]
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
            {pkg.trialEnabled && !pkg.archived && (
              <Badge tone="up">
                {pkg.trialDays === null ? 'Free trial' : `${pkg.trialDays}-day trial`}
              </Badge>
            )}
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
            authors={authors}
            items={items}
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
  authors,
  items,
  stripeReady,
  submitLabel,
  onSubmit,
  onCancel,
  onDone,
}: {
  initial?: AdminPackage
  authors: AuthorOption[]
  items: ItemOption[]
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
  const [imageUrl, setImageUrl] = React.useState(initial?.imageUrl ?? '')
  // Defaults on for a new package, matching the column — an operator turns off what they
  // would rather not push, rather than turning on everything they would.
  const [offerToMembers, setOfferToMembers] = React.useState(initial?.offerToMembers ?? true)
  const [sortOrder, setSortOrder] = React.useState(String(initial?.sortOrder ?? 0))
  const [authorId, setAuthorId] = React.useState(initial?.authorId ?? '')
  const [itemIds, setItemIds] = React.useState<string[]>(initial?.itemIds ?? [])
  const [trialEnabled, setTrialEnabled] = React.useState(initial?.trialEnabled ?? false)
  const [trialDays, setTrialDays] = React.useState(
    initial?.trialDays === null || initial?.trialDays === undefined ? '' : String(initial.trialDays),
  )
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const cents = parsePriceCents(price)
  /*
   * Whether this package currently opens anything. Not a block — see the switch below —
   * but worth saying out loud, because a trial on an empty bundle silently offers nothing.
   */
  const grantsNothing = initial !== undefined && initial.grantableItems === 0

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
        // Explicit null when emptied: the schema folds a blank to "leave alone", so
        // removing the picture has to be said out loud.
        imageUrl: imageUrl.trim() || null,
        offerToMembers,
        sortOrder: Number(sortOrder) || 0,
        // Explicitly null rather than omitted, so choosing "the house" on a package that
        // had an author actually clears it.
        authorId: authorId || null,
        itemIds,
        trialEnabled,
        // Blank means "use the house default", which is a real answer rather than a
        // missing one — so it is sent as null, not omitted.
        trialDays: trialDays.trim() === '' ? null : Number(trialDays),
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

        {/*
          Whose package this is, and therefore whose page it appears on.

          Only rendered once a contributor exists — a select with one option that means
          "nobody" is a question with no answer. Until then every package is the house's,
          which is what they all are today.
        */}
        {authors.length > 0 && (
          <div className="sm:col-span-2">
            <Label htmlFor={`author-${initial?.id ?? 'new'}`}>Attributed to</Label>
            <Select
              id={`author-${initial?.id ?? 'new'}`}
              value={authorId}
              onChange={(event) => setAuthorId(event.target.value)}
            >
              <option value="">The house — no single contributor</option>
              {authors.map((author) => (
                <option key={author.id} value={author.id}>
                  {author.name}
                </option>
              ))}
            </Select>
            <Hint>
              A package attributed to a contributor is sold on their page and counts as
              theirs. One author per package, so what each is owed is a sum rather than a
              percentage of anything.
            </Hint>
          </div>
        )}

        {/*
          What the package grants.

          The most consequential field on the form and, until now, the one with no control
          at all: PackageItem rows were read at redemption and written nowhere, so every
          package created here granted nothing. An empty one is allowed — a draft is a
          reasonable thing to save — and said out loud rather than left to be discovered by
          the first person who buys it.
        */}
        <div className="sm:col-span-2">
          <Label htmlFor={`items-${initial?.id ?? 'new'}`}>What this package includes</Label>
          {items.length === 0 ? (
            <Hint>
              Nothing to include yet. Create a section first — each one becomes available
              here automatically.
            </Hint>
          ) : (
            <>
              <div
                id={`items-${initial?.id ?? 'new'}`}
                className="mt-1 grid gap-2 rounded-lg border border-line bg-panel-2 p-3"
              >
                {items.map((item) => (
                  <label key={item.id} className="flex items-start gap-2.5">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#D6FD3A]"
                      checked={itemIds.includes(item.id)}
                      onChange={(event) =>
                        setItemIds((current) =>
                          event.target.checked
                            ? [...current, item.id]
                            : current.filter((id) => id !== item.id),
                        )
                      }
                    />
                    <span className="min-w-0 text-[14px] text-ink">
                      {item.name}
                      {item.archived && (
                        <span className="ml-2 font-mono text-[11px] text-ink-dim">off sale</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              {itemIds.length === 0 ? (
                /*
                  This said "would grant no access at all", which was the opposite of the
                  truth and the more dangerous way round to be wrong. An empty package
                  falls back to the legacy all-access membership — see grantFor — so
                  leaving it empty sells the whole site at this package's price.
                */
                <p className="mt-2 text-[13px] leading-relaxed text-down">
                  Nothing ticked, so this package still grants <strong>the whole site</strong> —
                  every contributor, every section. That is the old all-access membership.
                  Tick what it should actually include and it will grant only that from the
                  next sale onwards.
                </p>
              ) : (
                <Hint>
                  Changing this changes what new buyers get. Anybody who has already bought it
                  keeps exactly what they were granted at the time.
                </Hint>
              )}
            </>
          )}
        </div>

        {/*
          A free trial of this package: everything in it, on one end date.

          Switchable even while the package is empty, because "turn the trial on, then add
          the sections" is a perfectly ordinary order to work in. What stops an empty
          bundle being advertised is `packageTrial`, which returns no offer until there is
          something in it to open — so the worst case here is a switch that is on and
          waiting, not a signup page that grants nothing. The line below says which it is.
        */}
        {/*
          Who this gets suggested to, as opposed to who may take it up.

          The overlap rule already stops a member being offered a bundle they hold part of,
          and needs nobody's attention. This is the other half: whether the desk wants this
          package put in front of members at all. A package aimed at new buyers, or one
          being wound down, should not be suggested to somebody already subscribed.
        */}
        <div className="sm:col-span-2">
          <label className="flex items-start gap-3 rounded-lg border border-line bg-panel-2 p-3.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#D6FD3A]"
              checked={offerToMembers}
              onChange={(event) => setOfferToMembers(event.target.checked)}
            />
            <span className="min-w-0">
              <span className="block text-[14px] text-ink">Suggest this to existing members</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-ink-dim">
                Shows it under &ldquo;Also available to you&rdquo; on the member dashboard, to
                members who do not already hold any part of it — that overlap is handled for
                you. Turning this off does not withdraw the package: it is still sold on the
                homepage, on its contributor&rsquo;s page and at checkout.
              </span>
            </span>
          </label>
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-start gap-3 rounded-lg border border-line bg-panel-2 p-3.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#D6FD3A]"
              checked={trialEnabled}
              onChange={(event) => setTrialEnabled(event.target.checked)}
            />
            <span className="min-w-0">
              <span className="block text-[14px] text-ink">Offer a free trial of this package</span>
              <span className="mt-1 block text-[13px] leading-relaxed text-ink-dim">
                No card. Everything in the package opens at once and stops on its own —
                there is nothing to cancel. Somebody who has already held any part of this
                package cannot trial it again.
                {grantsNothing && (
                  <span className="mt-1 block text-down">
                    This package has no live research section in it yet, so nothing is offered
                    until you add one to its contents.
                  </span>
                )}
              </span>
            </span>
          </label>
        </div>

        {trialEnabled && (
          <div>
            <Label htmlFor={`trialdays-${initial?.id ?? 'new'}`}>Trial length (days)</Label>
            <Input
              id={`trialdays-${initial?.id ?? 'new'}`}
              value={trialDays}
              onChange={(event) => setTrialDays(event.target.value)}
              placeholder="Leave blank for the default"
              inputMode="numeric"
            />
            <Hint>
              Blank uses the house default set on the payment settings screen, so changing
              that moves every package that has no number of its own.
            </Hint>
          </div>
        )}

        <div className="sm:col-span-2">
          <label className="flex items-start gap-3 rounded-lg border border-line bg-panel-2 p-3.5">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#D6FD3A]"
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

        {/*
          The card's picture, uploaded exactly as a section's is.

          Reuses the section uploader and its `sections/` blob prefix rather than adding a
          third one. The prefix is a security boundary between *kinds of thing an admin
          uploads* — a token for it cannot write into the author area — and a package's
          title image is the same kind of thing as a section's: wide artwork for a card,
          chosen by the same person on an adjacent screen.
        */}
        <div className="sm:col-span-2">
          <SectionImageField
            id={`pkg-${initial?.id ?? 'new'}`}
            value={imageUrl}
            onChange={setImageUrl}
          />
        </div>

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
