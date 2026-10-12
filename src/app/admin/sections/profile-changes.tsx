'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { AuthorAvatar } from '@/components/author-avatar'
import { Button, Spinner } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

type Change = { field: string; label: string; before: string | null; after: string | null }
export type PendingProfile = { authorId: string; name: string; slug: string; submittedAt: string; changes: Change[]; flag: string | null }

/**
 * Experts' proposed profile edits, before and after, to approve or send back. Shown only
 * when something is waiting, at the top of the page where it will be seen.
 */
export function ProfileChanges({ pending }: { pending: PendingProfile[] }) {
  if (pending.length === 0) return null
  return (
    <section id="profile-changes" className="mb-10">
      <h2 className="eyebrow mb-3">Profile changes to approve · {pending.length}</h2>
      <div className="space-y-4">
        {pending.map((profile) => (
          <ProfileCard key={profile.authorId} profile={profile} />
        ))}
      </div>
    </section>
  )
}

function ProfileCard({ profile }: { profile: PendingProfile }) {
  const router = useRouter()
  const toast = useToast()
  const [busy, setBusy] = React.useState<'approve' | 'reject' | null>(null)
  const [rejecting, setRejecting] = React.useState(false)
  const [reason, setReason] = React.useState('')

  async function decide(decision: 'approve' | 'reject') {
    setBusy(decision)
    const response = await fetch(`/api/admin/authors/${profile.authorId}/profile-draft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, reason: decision === 'reject' ? reason : undefined }),
    }).catch(() => null)
    const body = await response?.json().catch(() => null)
    setBusy(null)
    if (!response?.ok) return toast(body?.error ?? 'Could not save that. Try again.', 'error')
    toast(decision === 'approve' ? `${profile.name}'s profile is updated` : 'Sent back with your reason', 'success')
    router.refresh()
  }

  return (
    <article className="panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="text-[17px] text-ink">{profile.name}</h3>
        <span className="text-[13px] text-ink-dim">
          Sent {profile.submittedAt} ·{' '}
          <Link href={`/experts/${profile.slug}`} className="underline underline-offset-4 hover:text-ink" target="_blank">
            live profile
          </Link>
        </span>
      </div>
      {profile.flag && (
        <p className="mt-3 rounded-lg border border-accent/40 bg-accent/5 px-3 py-2 text-[14px] text-ink">⚠ {profile.flag}</p>
      )}
      <dl className="mt-4 space-y-4">
        {profile.changes.map((change) => (
          <div key={change.field} className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr]">
            <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">{change.label}</dt>
            <dd className="text-[14px] text-ink-dim">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em]">Now</span>
              <Value field={change.field} value={change.before} name={profile.name} />
            </dd>
            <dd className="text-[14px] text-ink">
              <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-accent-ink">Proposed</span>
              <Value field={change.field} value={change.after} name={profile.name} />
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => decide('approve')} disabled={busy !== null}>
          {busy === 'approve' && <Spinner />}
          Approve and publish
        </Button>
        {rejecting ? (
          <>
            <Input
              aria-label="Why it is being sent back"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why — they will see this"
              maxLength={500}
              className="max-w-sm"
            />
            <Button size="sm" variant="secondary" onClick={() => decide('reject')} disabled={busy !== null || !reason.trim()}>
              {busy === 'reject' && <Spinner />}
              Send back
            </Button>
          </>
        ) : (
          <Button size="sm" variant="secondary" onClick={() => setRejecting(true)} disabled={busy !== null}>
            Send back…
          </Button>
        )}
      </div>
    </article>
  )
}

function Value({ field, value, name }: { field: string; value: string | null; name: string }) {
  if (!value) return <span className="italic">none</span>
  if (field === 'photoUrl') return <AuthorAvatar name={name} photoUrl={value} size={72} />
  return <span className="whitespace-pre-line break-words">{value}</span>
}
