'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button, Spinner } from '@/components/ui/button'
import { Hint, Input, Label, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'
import { authorInitials, parseCredentials } from '@/lib/section-shape'

export type AuthorRow = {
  id: string
  name: string
  slug: string
  headline: string | null
  bio: string | null
  photoUrl: string | null
  websiteUrl: string | null
  linkedinUrl: string | null
  xUrl: string | null
  credentials: string[]
  archived: boolean
  sectionCount: number
}

const EMPTY = {
  name: '',
  headline: '',
  bio: '',
  photoUrl: '',
  websiteUrl: '',
  linkedinUrl: '',
  xUrl: '',
  credentials: '',
}

/**
 * Author profiles — the part members actually see.
 *
 * This is a profile, not an account: there is no password field and no invitation, because
 * an author cannot sign in. Everything here is public, which is why the form says so next
 * to the biography rather than leaving somebody to find out by looking at the live page.
 */
export function AuthorManager({ authors }: { authors: AuthorRow[] }) {
  const router = useRouter()
  const toast = useToast()
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<string | null>(null)
  const [form, setForm] = React.useState({ ...EMPTY })
  const [busy, setBusy] = React.useState(false)

  function startEdit(author: AuthorRow) {
    setEditing(author.id)
    setOpen(true)
    setForm({
      name: author.name,
      headline: author.headline ?? '',
      bio: author.bio ?? '',
      photoUrl: author.photoUrl ?? '',
      websiteUrl: author.websiteUrl ?? '',
      linkedinUrl: author.linkedinUrl ?? '',
      xUrl: author.xUrl ?? '',
      credentials: author.credentials.join('\n'),
    })
  }

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

  async function save(event: React.FormEvent) {
    event.preventDefault()
    // Empty strings are sent as-is; the schema normalises them to "absent", which is what
    // clearing a field in this form should mean.
    const body = { ...form, credentials: parseCredentials(form.credentials) }
    const ok = editing
      ? await send(`/api/admin/authors/${editing}`, 'PATCH', body, `${form.name} saved`)
      : await send('/api/admin/authors', 'POST', body, `${form.name} added`)
    if (ok) {
      setForm({ ...EMPTY })
      setEditing(null)
      setOpen(false)
    }
  }

  return (
    <section className="panel mb-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-lg text-ink">Authors</h2>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-ink-dim">
            The experts whose work you publish. A profile, not a login — they cannot sign in,
            upload, or see members. Everything here appears on their public page.
          </p>
        </div>
        {!open && (
          <Button
            variant="secondary"
            onClick={() => {
              setEditing(null)
              setForm({ ...EMPTY })
              setOpen(true)
            }}
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add author
          </Button>
        )}
      </div>

      {open && (
        <form onSubmit={save} className="mt-5 rounded-lg border border-line bg-panel-2 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="a-name">Name</Label>
              <Input
                id="a-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Sarah Chen"
                required
                maxLength={80}
              />
            </div>
            <div>
              <Label htmlFor="a-headline">Headline</Label>
              <Input
                id="a-headline"
                value={form.headline}
                onChange={(e) => setForm({ ...form, headline: e.target.value })}
                placeholder="Twenty years on the LME floor."
                maxLength={140}
              />
              <Hint>One line, shown under their name on every report they write.</Hint>
            </div>
          </div>

          <div className="mt-4">
            <Label htmlFor="a-bio">Biography</Label>
            <Textarea
              id="a-bio"
              rows={4}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder="Where they have worked, what they cover, why a reader should trust them."
              maxLength={4000}
            />
            <Hint>Public. Shown in full on their profile page.</Hint>
          </div>

          <div className="mt-4">
            <Label htmlFor="a-creds">Credentials — one per line</Label>
            <Textarea
              id="a-creds"
              rows={3}
              value={form.credentials}
              onChange={(e) => setForm({ ...form, credentials: e.target.value })}
              placeholder={'CFA\nLME floor, 2004–2019\nPublished in Metal Bulletin'}
            />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {(
              [
                ['photoUrl', 'Photograph URL', 'https://…'],
                ['websiteUrl', 'Website', 'https://…'],
                ['linkedinUrl', 'LinkedIn', 'https://linkedin.com/in/…'],
                ['xUrl', 'X', 'https://x.com/…'],
              ] as const
            ).map(([key, label, placeholder]) => (
              <div key={key}>
                <Label htmlFor={`a-${key}`}>{label}</Label>
                <Input
                  id={`a-${key}`}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  placeholder={placeholder}
                  maxLength={300}
                />
              </div>
            ))}
          </div>
          <Hint>Links must start with http:// or https://. Leave blank to omit.</Hint>

          <div className="mt-5 flex flex-wrap gap-3">
            <Button type="submit" disabled={busy || !form.name.trim()}>
              {busy && <Spinner />}
              {editing ? 'Save changes' : 'Add author'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false)
                setEditing(null)
                setForm({ ...EMPTY })
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}

      {authors.length > 0 && (
        <ul className="mt-6 divide-y divide-line border-t border-line">
          {authors.map((author) => (
            <li key={author.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <span
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-panel-2 font-mono text-[12px] text-ink-dim"
              >
                {authorInitials(author.name)}
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-[15px] text-ink">{author.name}</span>
                <span className="ml-2 font-mono text-[11px] text-ink-dim">/{author.slug}</span>
                <p className="truncate text-[13px] text-ink-dim">
                  {author.headline ?? 'No headline yet'}
                </p>
                <p className="font-mono text-[11px] text-ink-dim">
                  {author.sectionCount} section{author.sectionCount === 1 ? '' : 's'}
                </p>
              </div>
              {author.archived && <Badge tone="muted">retired</Badge>}
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => startEdit(author)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    send(
                      `/api/admin/authors/${author.id}`,
                      'PATCH',
                      { archived: !author.archived },
                      author.archived ? `${author.name} restored` : `${author.name} retired`,
                    )
                  }
                >
                  {author.archived ? 'Restore' : 'Retire'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
