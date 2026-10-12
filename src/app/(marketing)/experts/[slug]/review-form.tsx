'use client'

import * as React from 'react'
import { Star } from 'lucide-react'

import { Button, Spinner } from '@/components/ui/button'
import { FieldError, Label, Textarea } from '@/components/ui/field'

type Option = { id: string; name: string; mine: { rating: number; body: string | null; status: string } | null }

const STATUS_NOTE: Record<string, string> = {
  pending: 'Your review is waiting for approval.',
  approved: 'Your review is live. Editing it sends it back for approval.',
  rejected: 'Your last review was not approved. You can write a new one.',
}

/**
 * A member's star rating and comment on one of this expert's sections. Says plainly that
 * nothing appears until it is approved, and that claims about returns are not published.
 */
export function ReviewForm({ sections }: { sections: Option[] }) {
  const [sectionId, setSectionId] = React.useState(sections[0]?.id ?? '')
  const current = sections.find((section) => section.id === sectionId)
  const [rating, setRating] = React.useState(current?.mine?.rating ?? 0)
  const [hover, setHover] = React.useState(0)
  const [body, setBody] = React.useState(current?.mine?.body ?? '')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [sent, setSent] = React.useState<string | null>(null)

  React.useEffect(() => {
    setRating(current?.mine?.rating ?? 0)
    setBody(current?.mine?.body ?? '')
    setSent(null)
    setError(null)
  }, [sectionId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!rating) return setError('Choose between 1 and 5 stars.')
    setPending(true)
    setError(null)
    const response = await fetch('/api/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionId, rating, body }),
    }).catch(() => null)
    const result = await response?.json().catch(() => null)
    setPending(false)
    if (!response?.ok) return setError(result?.error ?? 'Could not send your review. Try again.')
    setSent(sectionId)
  }

  if (sent === sectionId) {
    return (
      <p role="status" className="rounded-xl bg-paper-card p-5 text-[15px] text-ink-on-light">
        Thank you — your review is in. It will appear here once it has been approved.
      </p>
    )
  }

  const shown = hover || rating
  return (
    <form onSubmit={submit} noValidate className="space-y-4 rounded-2xl bg-paper-card p-6 shadow-[0_1px_2px_rgba(17,24,39,0.06)]">
      {sections.length > 1 && (
        <div>
          <Label htmlFor="review-section" tone="light">Subject</Label>
          <select
            id="review-section"
            value={sectionId}
            onChange={(event) => setSectionId(event.target.value)}
            className="mt-1 h-11 w-full rounded-lg border border-line-on-light bg-white px-3 text-[15px] text-ink-on-light"
          >
            {sections.map((section) => (
              <option key={section.id} value={section.id}>{section.name}</option>
            ))}
          </select>
        </div>
      )}
      {current?.mine && <p className="text-[14px] text-ink-on-light-dim">{STATUS_NOTE[current.mine.status]}</p>}
      <fieldset>
        <legend className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-on-light">Your rating</legend>
        <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              className="rounded p-1 text-ink-on-light focus-visible:outline-2"
            >
              <Star className={`h-7 w-7 ${n <= shown ? 'fill-current text-[rgb(var(--star))]' : 'opacity-30'}`} aria-hidden />
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <Label htmlFor="review-body" tone="light">What did you think? (optional)</Label>
        <Textarea
          id="review-body"
          tone="light"
          rows={4}
          maxLength={1500}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What you found useful — the analysis, the clarity, how often it arrives."
        />
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-on-light-dim">
          Reviews are read before they appear. Please don&rsquo;t mention returns, profits or trades you made — we
          can&rsquo;t publish performance claims.
        </p>
      </div>
      <FieldError tone="light">{error}</FieldError>
      <Button type="submit" variant="on-light-solid" disabled={pending}>
        {pending && <Spinner />}
        {current?.mine ? 'Update my review' : 'Send review'}
      </Button>
    </form>
  )
}
