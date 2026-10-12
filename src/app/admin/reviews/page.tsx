import type { Metadata } from 'next'
import Link from 'next/link'

import { ReviewActions } from '@/app/admin/reviews/review-actions'
import { Stars } from '@/components/stars'
import { Badge } from '@/components/ui/badge'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { sectionName } from '@/lib/section-shape'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Reviews', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

const INCLUDE = {
  section: { include: { topic: true, author: true } },
  member: { select: { email: true, firstName: true, lastName: true } },
} as const

/**
 * The review queue. Nothing a member writes is shown until it is approved here, and the
 * ones that read like a claim about returns come first, with the reason.
 */
export default async function AdminReviewsPage() {
  await requireAdmin()

  const [pending, recent, closedSections] = await Promise.all([
    db.sectionReview.findMany({
      where: { status: 'pending' },
      // Flagged first (non-null reasons sort ahead of nulls when descending), then oldest first.
      orderBy: [{ flagReason: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'asc' }],
      include: INCLUDE,
    }),
    db.sectionReview.findMany({
      where: { status: { not: 'pending' } },
      orderBy: { decidedAt: 'desc' },
      take: 30,
      include: INCLUDE,
    }),
    db.section.count({ where: { reviewsEnabled: false, archivedAt: null } }),
  ])

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-5 sm:py-12">
      <span className="eyebrow">Moderation</span>
      <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Reviews</h1>
      <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-ink-dim">
        Any signed-in member can rate a section that has reviews turned on. Nothing is shown until you approve it here.
        Reject anything that claims a return or profit — that is a performance claim the site would be publishing.
        {closedSections > 0 && (
          <>
            {' '}
            {closedSections} section{closedSections === 1 ? ' has' : 's have'} reviews off; turn them on in{' '}
            <Link href="/admin/sections" className="text-accent-ink underline underline-offset-4">Sections</Link>.
          </>
        )}
      </p>

      <section className="mt-10">
        <div className="mb-3 flex items-center gap-3">
          <h2 className="eyebrow">Waiting</h2>
          {pending.length > 0 && <Badge tone="accent">{pending.length}</Badge>}
        </div>
        {pending.length === 0 ? (
          <div className="panel px-5 py-10 text-center text-[15px] text-ink-dim">Nothing waiting.</div>
        ) : (
          <div className="space-y-3">
            {pending.map((review) => (
              <article key={review.id} className={`panel px-5 py-5 ${review.flagReason ? 'border-down/50' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 max-w-3xl">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <Stars rating={review.rating} />
                      <span className="text-[15px] text-ink">{sectionName(review.section)}</span>
                      {review.verified ? <Badge tone="up">Verified subscriber</Badge> : <Badge tone="muted">Not a subscriber</Badge>}
                    </div>
                    <p className="mt-1 font-mono text-[13px] text-ink-dim">
                      {[review.member.firstName, review.member.lastName].filter(Boolean).join(' ') || '—'} · {review.member.email} ·{' '}
                      {formatDate(review.updatedAt)}
                    </p>
                    {review.flagReason && (
                      <p className="mt-3 rounded-lg border border-down/40 px-3 py-2 text-[14px] text-down">{review.flagReason}</p>
                    )}
                    {review.body ? (
                      <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-ink">{review.body}</p>
                    ) : (
                      <p className="mt-3 text-[14px] text-ink-dim">Stars only, no comment.</p>
                    )}
                  </div>
                  <ReviewActions reviewId={review.id} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mt-12">
        <h2 className="eyebrow mb-3">Recently decided</h2>
        {recent.length === 0 ? (
          <div className="panel px-5 py-8 text-center text-[15px] text-ink-dim">No decisions yet.</div>
        ) : (
          <div className="panel relative overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left">
              <thead>
                <tr className="border-b border-line">
                  <th className="eyebrow px-4 py-3">Section</th>
                  <th className="eyebrow px-4 py-3">Rating</th>
                  <th className="eyebrow px-4 py-3">By</th>
                  <th className="eyebrow px-4 py-3">Decision</th>
                  <th className="eyebrow px-4 py-3">On</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((review) => (
                  <tr key={review.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-3 text-[14px] text-ink">{sectionName(review.section)}</td>
                    <td className="px-4 py-3"><Stars rating={review.rating} /></td>
                    <td className="px-4 py-3 font-mono text-[13px] text-ink-dim">{review.member.email}</td>
                    <td className="px-4 py-3">
                      <Badge tone={review.status === 'approved' ? 'up' : 'muted'}>{review.status}</Badge>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[14px] text-ink-dim">{review.decidedAt ? formatDate(review.decidedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
