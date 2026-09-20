'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

import { SectionImageField } from '@/app/admin/sections/image-field'
import { Badge } from '@/components/ui/badge'
import { Button, Spinner } from '@/components/ui/button'
import { Hint, Input, Label, Select, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { amountString, formatPrice, parsePriceCents } from '@/lib/package-shape'
import { sectionName } from '@/lib/section-shape'

export type SectionRow = {
  id: string
  slug: string
  displayName: string | null
  description: string | null
  imageUrl: string | null
  cadence: string | null
  /** The grantable item behind this section. Null only for a section created before items. */
  itemSlug: string | null
  trialEnabled: boolean
  trialDays: number | null
  topic: { name: string }
  author: { name: string }
  priceCents: number
  currency: string
  interval: string
  sortOrder: number
  archived: boolean
  reportCount: number
  subscriberCount: number
}

type Option = { id: string; name: string }

/**
 * Sections — a topic, an author and a price.
 *
 * The topic and author are choosable when creating and fixed afterwards. A section *is*
 * that pair: changing either would move every report filed under it and hand its revenue
 * to a different person, so the fix for the wrong pair is to retire the section and make
 * the right one, which costs nothing while it has no subscribers.
 */
/**
 * The answers most sections will want, offered rather than imposed.
 *
 * Ordered by how often they are likely to be picked, not alphabetically — the operator is
 * scanning for theirs, and "Daily" at the top of a list beginning with "Every Friday" is
 * the one they most often mean.
 */
const CADENCE_PRESETS = [
  'Daily',
  'Three times a week',
  'Twice a week',
  'Weekly',
  'Every weekday',
  'Fortnightly',
  'Monthly',
] as const

export function SectionManager({
  topics,
  authors,
  sections,
}: {
  topics: Option[]
  authors: Option[]
  sections: SectionRow[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [form, setForm] = React.useState({
    topicId: '',
    authorId: '',
    price: '49.00',
    interval: 'month',
    description: '',
    imageUrl: '',
    cadence: '',
  })

  const topic = topics.find((t) => t.id === form.topicId)
  const author = authors.find((a) => a.id === form.authorId)
  // Shown live, because the operator is choosing two dropdowns and the thing they are
  // actually naming is the combination.
  const preview =
    topic && author ? sectionName({ topic: { name: topic.name }, author: { name: author.name } }) : null

  async function send(url: string, method: string, body: unknown, done: string) {
    setBusy(true)
    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast(data?.error ?? `That did not work (HTTP ${response.status}).`, 'error')
        return false
      }
      toast(done)
      router.refresh()
      return true
    } catch {
      toast('Could not reach the server.', 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    const priceCents = parsePriceCents(form.price)
    if (priceCents === null) {
      toast('Enter a price like 49.00.', 'error')
      return
    }
    const ok = await send(
      '/api/admin/sections',
      'POST',
      {
        topicId: form.topicId,
        authorId: form.authorId,
        priceCents,
        interval: form.interval,
        description: form.description,
        imageUrl: form.imageUrl,
        cadence: form.cadence,
      },
      `${preview ?? 'Section'} created`,
    )
    if (ok) {
      setForm({
        topicId: '',
        authorId: '',
        price: '49.00',
        interval: 'month',
        description: '',
        imageUrl: '',
        cadence: '',
      })
      setOpen(false)
    }
  }

  const blocked = topics.length === 0 || authors.length === 0

  return (
    <section className="panel p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg text-ink">Sections</h2>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-dim">
            What a member subscribes to. One topic, one author, one price.
          </p>
        </div>
        {!open && (
          <Button variant="secondary" disabled={blocked} onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden />
            Add section
          </Button>
        )}
      </div>

      {blocked && (
        <p className="mt-4 text-[13px] leading-relaxed text-ink-dim">
          Add {topics.length === 0 ? 'a topic' : null}
          {topics.length === 0 && authors.length === 0 ? ' and ' : null}
          {authors.length === 0 ? 'an author' : null} above first — a section is made of both.
        </p>
      )}

      {open && (
        <form onSubmit={create} className="mt-5 rounded-lg border border-line bg-panel-2 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="s-topic">Topic</Label>
              <Select
                id="s-topic"
                value={form.topicId}
                onChange={(e) => setForm({ ...form, topicId: e.target.value })}
                required
              >
                <option value="">Choose a topic…</option>
                {topics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="s-author">Author</Label>
              <Select
                id="s-author"
                value={form.authorId}
                onChange={(e) => setForm({ ...form, authorId: e.target.value })}
                required
              >
                <option value="">Choose an author…</option>
                {authors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {preview && (
            <p className="mt-4 rounded-lg border border-accent/30 bg-accent/[0.06] px-4 py-3 text-[14px] text-ink">
              This section will be called <span className="text-accent">{preview}</span>
            </p>
          )}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="s-price">Price</Label>
              <Input
                id="s-price"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                inputMode="decimal"
                placeholder="49.00"
              />
              <Hint>USD. Charged per billing period, to this author&rsquo;s subscribers only.</Hint>
            </div>
            <div>
              <Label htmlFor="s-interval">Billing</Label>
              <Select
                id="s-interval"
                value={form.interval}
                onChange={(e) => setForm({ ...form, interval: e.target.value })}
              >
                <option value="month">Monthly</option>
                <option value="year">Yearly</option>
              </Select>
            </div>
          </div>

          <div className="mt-4">
            <Label htmlFor="s-cadence">How often it publishes</Label>
            <Input
              id="s-cadence"
              list="cadence-presets"
              value={form.cadence}
              onChange={(e) => setForm({ ...form, cadence: e.target.value })}
              placeholder="Three times a week"
              maxLength={48}
            />
            {/*
              A list, not a dropdown. The common answers are one click away so five
              sections do not end up saying "3x/wk", "thrice weekly" and "3 a week" — but
              an author who publishes "twice a month, plus event notes" can still type it.
              An enum would force that into the nearest wrong word, and this is a promise
              to somebody who is paying.
            */}
            <datalist id="cadence-presets">
              {CADENCE_PRESETS.map((preset) => (
                <option key={preset} value={preset} />
              ))}
            </datalist>
            <Hint>
              Shown beside the price wherever this subject is sold. Leave it blank to claim
              nothing — better than a number this author cannot keep.
            </Hint>
          </div>

          <div className="mt-4">
            <Label htmlFor="s-desc">Description</Label>
            <Textarea
              id="s-desc"
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What a subscriber to this section gets, and how often."
              maxLength={600}
            />
          </div>

          <div className="mt-4">
            <SectionImageField
              id="s-new"
              value={form.imageUrl}
              onChange={(imageUrl) => setForm({ ...form, imageUrl })}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="submit" disabled={busy || !form.topicId || !form.authorId}>
              {busy && <Spinner />}
              Create section
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {sections.length > 0 && (
        <ul className="mt-6 divide-y divide-line border-t border-line">
          {sections.map((section) => (
            <li key={section.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              {/* The picture, at the size a card shows it, so a wrong one is obvious in
                  the list rather than only on the public page. */}
              <div className="h-10 w-[72px] shrink-0 overflow-hidden rounded border border-line bg-panel-2">
                {section.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={section.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[15px] text-ink">
                  {sectionName({
                    displayName: section.displayName,
                    topic: section.topic,
                    author: section.author,
                  })}
                </span>
                <span className="ml-2 font-mono text-[11px] text-ink-dim">/{section.slug}</span>
                <p className="font-mono text-[11px] text-ink-dim">
                  {formatPrice(section.priceCents, section.currency)}/{section.interval} ·{' '}
                  {section.reportCount} report{section.reportCount === 1 ? '' : 's'} ·{' '}
                  {section.subscriberCount} subscriber{section.subscriberCount === 1 ? '' : 's'}
                </p>
              </div>
              {section.archived && <Badge tone="muted">off sale</Badge>}
              <div className="flex gap-2">
                <PriceEditor
                  section={section}
                  busy={busy}
                  onSave={(cents) =>
                    send(
                      `/api/admin/sections/${section.id}`,
                      'PATCH',
                      { priceCents: cents },
                      `Price set to ${formatPrice(cents, section.currency)}`,
                    )
                  }
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    send(
                      `/api/admin/sections/${section.id}`,
                      'PATCH',
                      { archived: !section.archived },
                      section.archived ? 'Back on sale' : 'Taken off sale',
                    )
                  }
                >
                  {section.archived ? 'Put back' : 'Take off sale'}
                </Button>
                {/*
                  Offered only for a section that is not yet a record of anything.

                  The counts beside the name are the same two the route checks, so what
                  the operator can see explains what they can do. The route checks two
                  more — orders and access codes — and refuses with the reason, so a
                  section that looks empty here and is not stays safe.

                  Confirmed, because unlike "Take off sale" it cannot be undone by
                  pressing the button again.
                */}
                {section.reportCount === 0 && section.subscriberCount === 0 && (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(`Delete "${sectionName(section)}"? It has no reports and no subscribers, so nothing is lost — but this cannot be undone.`)) return
                      void send(
                        `/api/admin/sections/${section.id}`,
                        'DELETE',
                        {},
                        'Section deleted',
                      )
                    }}
                  >
                    Delete
                  </Button>
                )}
                <SectionRename
                  section={section}
                  busy={busy}
                  onSave={(fields) =>
                    send(
                      `/api/admin/sections/${section.id}`,
                      'PATCH',
                      fields,
                      'Section title updated',
                    )
                  }
                />
                <TrialEditor section={section} />
                <ImageEditor
                  section={section}
                  busy={busy}
                  onSave={(imageUrl) =>
                    send(
                      `/api/admin/sections/${section.id}`,
                      'PATCH',
                      // null, not '': the API reads null as "remove it" and an empty
                      // string as "nothing was said".
                      { imageUrl: imageUrl || null },
                      imageUrl ? 'Title image updated' : 'Title image removed',
                    )
                  }
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Rename a section, and edit the line under its name.
 *
 * A section is called "<topic> by <expert>" unless a display name overrides it, and that
 * override could only be set at creation — so a subject the desk wanted to call
 * "Energy, Metals & Commodities" rather than "Energy by Dean Rogers" had to be rebuilt to
 * change it, taking its reports and its subscribers with it.
 *
 * The slug does not move. It is in URLs and in the item handle that entitlements point at,
 * so renaming changes what the section is called and not what it is.
 *
 * Blank clears the override and the name goes back to being derived — which is why the
 * field shows the derived name as its placeholder rather than pre-filling it, so an
 * operator can see what they would get by emptying it.
 */
function SectionRename({
  section,
  busy,
  onSave,
}: {
  section: SectionRow
  busy: boolean
  onSave: (fields: { displayName: string; description: string; cadence: string | null }) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [displayName, setDisplayName] = React.useState(section.displayName ?? '')
  const [description, setDescription] = React.useState(section.description ?? '')
  const [cadence, setCadence] = React.useState(section.cadence ?? '')

  const derived = sectionName({
    displayName: null,
    topic: section.topic,
    author: section.author,
  })

  if (!open) {
    return (
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => setOpen(true)}>
        Edit title
      </Button>
    )
  }

  return (
    <div className="mt-2 w-full basis-full rounded-lg border border-line bg-panel-2 p-4">
      <div>
        <Label htmlFor={`name-${section.id}`}>Title</Label>
        <Input
          id={`name-${section.id}`}
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder={derived}
          maxLength={80}
        />
        <Hint>Leave it blank to use &ldquo;{derived}&rdquo;.</Hint>
      </div>

      <div className="mt-3">
        <Label htmlFor={`cadence-${section.id}`}>How often it publishes</Label>
        <Input
          id={`cadence-${section.id}`}
          list="cadence-presets"
          value={cadence}
          onChange={(event) => setCadence(event.target.value)}
          placeholder="Three times a week"
          maxLength={48}
        />
        <Hint>Shown beside the price. Empty it to claim nothing.</Hint>
      </div>

      <div className="mt-3">
        <Label htmlFor={`desc-${section.id}`}>Description</Label>
        <Textarea
          id={`desc-${section.id}`}
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What a subscriber to this section gets, and how often."
          maxLength={600}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy}
          onClick={() => {
            onSave({
              displayName: displayName.trim(),
              description: description.trim(),
              // Explicit null, not '': the schema folds a blank to "leave alone", so an
              // emptied box has to say out loud that the cadence is being removed.
              cadence: cadence.trim() || null,
            })
            setOpen(false)
          }}
        >
          Save
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setDisplayName(section.displayName ?? '')
            setDescription(section.description ?? '')
            setCadence(section.cadence ?? '')
            setOpen(false)
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

/**
 * Opening or closing this subject's free trial, from the screen the subject lives on.
 *
 * The switch itself is on the section's *item* — that is where every trial is stored, so
 * the one on a package and the one here cannot disagree about what is on offer. This is a
 * second door onto the same setting, put where an operator is already looking rather than
 * on a payments screen two clicks away.
 *
 * A section with no item cannot be trialled and says so, rather than offering a control
 * that would fail: that only happens to a section created before items existed.
 */
function TrialEditor({ section }: { section: SectionRow }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [enabled, setEnabled] = React.useState(section.trialEnabled)
  const [days, setDays] = React.useState(section.trialDays === null ? '' : String(section.trialDays))
  const [busy, setBusy] = React.useState(false)

  if (!section.itemSlug) return null

  async function save() {
    setBusy(true)
    try {
      const response = await fetch('/api/admin/trial', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemSlug: section.itemSlug,
          enabled,
          // Blank means "use the house default", which is a real answer rather than a
          // missing one — so it is sent as null rather than omitted.
          days: days.trim() === '' ? null : Number(days),
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        toast(data?.error ?? `Could not save (HTTP ${response.status}).`, 'error')
        return
      }
      toast(enabled ? 'Trial open for this subject' : 'Trial closed', 'success')
      setOpen(false)
      router.refresh()
    } catch {
      toast('Could not reach the server.', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        {section.trialEnabled
          ? `Trial: ${section.trialDays ?? 'default'} days`
          : 'Start a trial'}
      </Button>
    )
  }

  return (
    <div className="mt-2 w-full basis-full rounded-lg border border-line bg-panel-2 p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-[#D6FD3A]"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span>
          <span className="block text-[14px] text-ink">Offer a free trial of this subject</span>
          <span className="mt-1 block text-[13px] leading-relaxed text-ink-dim">
            No card. It grants this one section and stops on its own. Somebody who has ever
            held this subject cannot trial it again.
          </span>
        </span>
      </label>

      {enabled && (
        <div className="mt-3 max-w-[12rem]">
          <Label htmlFor={`trial-${section.id}`}>Length (days)</Label>
          <Input
            id={`trial-${section.id}`}
            value={days}
            onChange={(event) => setDays(event.target.value)}
            placeholder="e.g. 21"
            inputMode="numeric"
          />
          <Hint>Blank uses the house default.</Hint>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={save}>
          {busy && <Spinner />}
          Save
        </Button>
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => {
            setEnabled(section.trialEnabled)
            setDays(section.trialDays === null ? '' : String(section.trialDays))
            setOpen(false)
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

/**
 * Setting a section's title image after it exists.
 *
 * Collapsed until asked for, because most visits to this screen are about price or
 * availability, and an upload widget open on every row would bury them.
 */
function ImageEditor({
  section,
  busy,
  onSave,
}: {
  section: SectionRow
  busy: boolean
  onSave: (imageUrl: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState(section.imageUrl ?? '')

  if (!open) {
    return (
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => setOpen(true)}>
        {section.imageUrl ? 'Change image' : 'Add image'}
      </Button>
    )
  }

  return (
    <div className="mt-2 w-full basis-full rounded-lg border border-line bg-panel-2 p-4">
      <SectionImageField id={`s-${section.id}`} value={value} onChange={setValue} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy || value === (section.imageUrl ?? '')}
          onClick={() => {
            onSave(value)
            setOpen(false)
          }}
        >
          Save image
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setValue(section.imageUrl ?? '')
            setOpen(false)
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

/**
 * Editing a price in place.
 *
 * Says plainly that it applies to new subscribers only — existing entitlements bill on the
 * Stripe subscription they were created with, and an operator who assumes otherwise would
 * think they had just given everyone a rise.
 */
function PriceEditor({
  section,
  busy,
  onSave,
}: {
  section: SectionRow
  busy: boolean
  onSave: (cents: number) => Promise<boolean>
}) {
  const toast = useToast()
  const [editing, setEditing] = React.useState(false)
  const [value, setValue] = React.useState(amountString(section.priceCents))

  if (!editing) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
        Price
      </Button>
    )
  }

  return (
    <span className="flex items-center gap-2">
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        inputMode="decimal"
        className="w-24"
        aria-label={`Price for ${section.slug}`}
      />
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          const cents = parsePriceCents(value)
          if (cents === null) {
            toast('Enter a price like 49.00.', 'error')
            return
          }
          if (
            section.subscriberCount > 0 &&
            !window.confirm(
              `Change the price to ${formatPrice(cents, section.currency)}?\n\n` +
                `This applies to new subscribers only. The ${section.subscriberCount} member` +
                `${section.subscriberCount === 1 ? '' : 's'} already on this section keep paying ` +
                `what they signed up at.`,
            )
          ) {
            return
          }
          if (await onSave(cents)) setEditing(false)
        }}
      >
        Save
      </Button>
      <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
        Cancel
      </Button>
    </span>
  )
}
