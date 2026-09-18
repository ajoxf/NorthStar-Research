'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button, Spinner } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

export type TopicRow = {
  id: string
  name: string
  slug: string
  blurb: string | null
  sortOrder: number
  archived: boolean
  sectionCount: number
}

/**
 * Topics: the shortest list on the page, and the one to fill in first.
 *
 * Deliberately just a name and a line of blurb. A topic is a label that groups sections
 * across authors; everything commercial lives on the section, so there is nothing else
 * here to get wrong.
 */
export function TopicManager({ topics }: { topics: TopicRow[] }) {
  const router = useRouter()
  const toast = useToast()
  const [name, setName] = React.useState('')
  const [busy, setBusy] = React.useState(false)

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

  return (
    <section className="panel mb-6 p-6">
      <h2 className="font-display text-lg text-ink">Topics</h2>
      <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-dim">
        The subjects the desk covers. Several authors can write in the same topic — that is
        what lets a visitor browse Energy and find everyone covering it.
      </p>

      <form
        className="mt-5 flex flex-wrap items-end gap-3"
        onSubmit={async (event) => {
          event.preventDefault()
          if (!name.trim()) return
          if (await send('/api/admin/topics', 'POST', { name: name.trim() }, `${name.trim()} added`)) {
            setName('')
          }
        }}
      >
        <div className="min-w-[220px] flex-1">
          <Label htmlFor="topic-name">New topic</Label>
          <Input
            id="topic-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Energy &amp; Commodities"
            maxLength={80}
          />
        </div>
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? <Spinner /> : <Plus className="h-4 w-4" aria-hidden />}
          Add topic
        </Button>
      </form>

      {topics.length > 0 && (
        <ul className="mt-6 divide-y divide-line border-t border-line">
          {topics.map((topic) => (
            <li key={topic.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1">
                <span className="text-[15px] text-ink">{topic.name}</span>
                <span className="ml-2 font-mono text-[11px] text-ink-dim">/{topic.slug}</span>
                <p className="font-mono text-[11px] text-ink-dim">
                  {topic.sectionCount} section{topic.sectionCount === 1 ? '' : 's'}
                </p>
              </div>
              {topic.archived && <Badge tone="muted">retired</Badge>}
              <TopicRename
                topic={topic}
                busy={busy}
                onSave={(name) =>
                  send(`/api/admin/topics/${topic.id}`, 'PATCH', { name }, `Renamed to ${name}`)
                }
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  send(
                    `/api/admin/topics/${topic.id}`,
                    'PATCH',
                    { archived: !topic.archived },
                    topic.archived ? `${topic.name} restored` : `${topic.name} retired`,
                  )
                }
              >
                {topic.archived ? 'Restore' : 'Retire'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * Rename a topic in place.
 *
 * The name is what a visitor reads — every section under it is called "<topic> by
 * <expert>" — and a typo in it used to be permanent, because the only way out was to
 * retire the topic and rebuild its sections underneath a new one.
 *
 * **The slug does not move with it.** It is in URLs that may already have been shared, so
 * a rename changes what the topic is called and not where it lives. The server says the
 * same thing, and keeps the stored item names in step so the package contents picker does
 * not go on offering the old wording.
 */
function TopicRename({
  topic,
  busy,
  onSave,
}: {
  topic: { id: string; name: string }
  busy: boolean
  onSave: (name: string) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState(topic.name)

  if (!open) {
    return (
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => setOpen(true)}>
        Rename
      </Button>
    )
  }

  const trimmed = value.trim()

  return (
    <div className="flex w-full basis-full flex-wrap items-center gap-2">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        className="max-w-xs"
        maxLength={60}
        aria-label={`New name for ${topic.name}`}
      />
      <Button
        size="sm"
        disabled={busy || trimmed.length < 2 || trimmed === topic.name}
        onClick={() => {
          onSave(trimmed)
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
          setValue(topic.name)
          setOpen(false)
        }}
      >
        Cancel
      </Button>
    </div>
  )
}
