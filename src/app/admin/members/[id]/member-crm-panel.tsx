'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Hint, Input, Label, Select, Textarea } from '@/components/ui/field'
import { useToast } from '@/components/ui/toast'

type CrmMember = {
  id: string
  subscriptionStatus: string
  tags: string[]
  adminNotes: string | null
}

export function MemberCrmPanel({ member }: { member: CrmMember }) {
  const router = useRouter()
  const toast = useToast()

  const [status, setStatus] = React.useState(member.subscriptionStatus)
  const [tags, setTags] = React.useState<string[]>(member.tags)
  const [tagDraft, setTagDraft] = React.useState('')
  const [notes, setNotes] = React.useState(member.adminNotes ?? '')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  function addTag() {
    const value = tagDraft.trim()
    if (!value || tags.includes(value)) {
      setTagDraft('')
      return
    }
    setTags([...tags, value])
    setTagDraft('')
  }

  async function save() {
    setError(null)
    setPending(true)

    try {
      const response = await fetch(`/api/admin/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionStatus: status, tags, adminNotes: notes }),
      })
      const data = await response.json()

      if (!response.ok) {
        setError(data.error ?? 'Changes could not be saved.')
        return
      }

      toast('Member updated', 'success')
      router.refresh()
    } catch {
      setError('Changes could not be saved.')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="mt-8 rounded-lg border border-line bg-panel p-6">
      <h2 className="mb-5 font-mono text-[13px] uppercase tracking-[0.12em] text-ink-dim">
        CRM record
      </h2>

      <div className="mb-5">
        <Label htmlFor="status">Subscription status</Label>
        <Select
          id="status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="sm:w-56"
        >
          {['pending', 'active', 'expired', 'cancelled'].map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
        <Hint>
          Setting a member to active grants immediate access without a code — use for comped
          accounts or to fix a payment that did not register.
        </Hint>
      </div>

      <div className="mb-5">
        <Label htmlFor="tag">Tags</Label>
        <div className="mb-2.5 flex flex-wrap gap-2">
          {tags.length === 0 && (
            <span className="font-mono text-[12px] text-ink-dim">No tags yet.</span>
          )}
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel-2 py-1 pl-3 pr-2 font-mono text-[11px] text-ink"
            >
              {tag}
              <button
                type="button"
                onClick={() => setTags(tags.filter((entry) => entry !== tag))}
                aria-label={`Remove tag ${tag}`}
                className="text-ink-dim transition-colors hover:text-down"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            id="tag"
            value={tagDraft}
            placeholder="vip, renewal-risk…"
            onChange={(event) => setTagDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addTag()
              }
            }}
            className="sm:w-64"
          />
          <Button type="button" variant="secondary" onClick={addTag}>
            Add
          </Button>
        </div>
        <Hint>Tags export to CSV and map directly onto ESP tags if delivery moves to Kit.</Hint>
      </div>

      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          rows={5}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Internal notes about this member — support history, renewal conversations…"
        />
      </div>

      <FieldError>{error}</FieldError>

      <div className="mt-5 flex justify-end">
        <Button onClick={save} disabled={pending}>
          {pending ? (
            <>
              <Spinner />
              Saving…
            </>
          ) : (
            'Save record'
          )}
        </Button>
      </div>
    </section>
  )
}
