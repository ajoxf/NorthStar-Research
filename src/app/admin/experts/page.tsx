import type { Metadata } from 'next'
import Link from 'next/link'
import { Eye, FileDown, Pencil } from 'lucide-react'

import { ExpertPortalAccess } from '@/app/admin/sections/author-manager'
import { ProfileChanges } from '@/app/admin/sections/profile-changes'
import { AuthorAvatar } from '@/components/author-avatar'
import { Badge } from '@/components/ui/badge'
import { ToastProvider } from '@/components/ui/toast'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { pendingProfileDrafts } from '@/lib/expert-profile'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Experts', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * Everything about the subject matter experts in one place: who has a login, what is
 * waiting on the desk from each of them, and a way to see their page as they see it.
 * Their public profiles and sections are still set up on the Sections page.
 */
export default async function AdminExpertsPage() {
  await requireAdmin()

  const [authors, profileDrafts, waitingReports, payoutDetails] = await Promise.all([
    db.author.findMany({
      orderBy: [{ archivedAt: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        slug: true,
        headline: true,
        photoUrl: true,
        memberId: true,
        archivedAt: true,
        sections: { where: { archivedAt: null }, select: { id: true } },
      },
    }),
    pendingProfileDrafts(),
    db.report.findMany({
      where: { reviewStatus: 'pending', published: false },
      orderBy: { submittedAt: 'asc' },
      select: { id: true, title: true, submittedByAuthorId: true },
    }),
    db.payoutDetails.findMany({ where: { authorId: { not: null } }, select: { authorId: true } }),
  ])

  const memberIds = authors.map((author) => author.memberId).filter((id): id is string => Boolean(id))
  const members = new Map(
    (memberIds.length ? await db.member.findMany({ where: { id: { in: memberIds } }, select: { id: true, email: true, lastLoginAt: true } }) : []).map(
      (member) => [member.id, member],
    ),
  )
  const withPayout = new Set(payoutDetails.map((row) => row.authorId))
  const profileWaiting = new Set(profileDrafts.map((draft) => draft.authorId))

  return (
    <ToastProvider>
      <div className="mx-auto max-w-5xl px-5 py-12">
        <span className="eyebrow">Subject matter experts</span>
        <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Experts</h1>
        <p className="mt-3 max-w-2xl text-[17px] leading-relaxed text-ink-dim">
          Invite experts to their page, see what is waiting from them, and look at their page exactly as they see it. Their
          public profile, sections and revenue share are set on{' '}
          <Link href="/admin/sections" className="underline underline-offset-4 hover:text-ink">
            Sections
          </Link>
          .
        </p>

        {waitingReports.length > 0 && (
          <section className="mt-8">
            <h2 className="eyebrow mb-3">Reports to review · {waitingReports.length}</h2>
            <ul className="panel divide-y divide-line/60">
              {waitingReports.map((report) => (
                <li key={report.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <span className="text-[15px] text-ink">
                    {report.title}
                    <span className="ml-2 text-[13px] text-ink-dim">
                      by {authors.find((author) => author.id === report.submittedByAuthorId)?.name ?? 'an expert'}
                    </span>
                  </span>
                  <Link href={`/admin/reports/${report.id}`} className="text-[14px] text-accent-ink hover:underline">
                    Review →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="mt-8">
          <ProfileChanges pending={profileDrafts.map((draft) => ({ ...draft, submittedAt: formatDate(draft.submittedAt) }))} />
        </div>

        <section className="mt-2">
          <h2 className="eyebrow mb-3">All experts · {authors.length}</h2>
          <ul className="panel divide-y divide-line/60">
            {authors.map((author) => {
              const member = author.memberId ? members.get(author.memberId) : undefined
              const reports = waitingReports.filter((report) => report.submittedByAuthorId === author.id).length
              return (
                <li key={author.id} className="flex flex-wrap items-start gap-4 px-5 py-4">
                  <AuthorAvatar name={author.name} photoUrl={author.photoUrl} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[16px] text-ink">{author.name}</span>
                      {author.archivedAt && <Badge tone="muted">retired</Badge>}
                      {reports > 0 && <Badge tone="accent">{reports} report{reports === 1 ? '' : 's'} to review</Badge>}
                      {profileWaiting.has(author.id) && <Badge tone="accent">profile changes</Badge>}
                    </div>
                    <div className="mt-0.5 text-[13px] text-ink-dim">
                      {author.sections.length} live section{author.sections.length === 1 ? '' : 's'} ·{' '}
                      {withPayout.has(author.id) ? 'payout details on file' : 'no payout details yet'}
                    </div>
                    <ExpertPortalAccess
                      authorId={author.id}
                      name={author.name}
                      portal={member ? { email: member.email, signedIn: member.lastLoginAt !== null } : null}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/experts/${author.id}/view`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[13px] text-ink hover:border-accent/50"
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden />
                      View as expert
                    </Link>
                    <a
                      href={`/api/admin/authors/${author.id}/weekly-report`}
                      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[13px] text-ink hover:border-accent/50"
                    >
                      <FileDown className="h-3.5 w-3.5" aria-hidden />
                      Weekly report
                    </a>
                    <Link
                      href="/admin/sections"
                      className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-[13px] text-ink hover:border-accent/50"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      Edit profile
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </ToastProvider>
  )
}
