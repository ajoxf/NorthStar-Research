import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ArchiveBrowser } from '@/app/(portal)/archive/archive-browser'
import { getCurrentMember, memberHasAnyAccess, memberReportWhere } from '@/lib/auth'
import { db } from '@/lib/db'

export const metadata: Metadata = { title: 'Archive' }
export const dynamic = 'force-dynamic'

export default async function ArchivePage({
  searchParams,
}: {
  searchParams: { expert?: string }
}) {
  const member = await getCurrentMember()
  if (!member) redirect('/login?next=/archive')
  if (!(await memberHasAnyAccess(member))) redirect('/dashboard')

  const visible = await memberReportWhere(member)

  /*
   * Narrowing to one expert, when the member arrived from their card.
   *
   * **On top of `visible`, never instead of it.** This is a convenience filter chosen by
   * whoever typed the URL, and a query parameter must not be able to widen what somebody
   * can read — so the entitlement fragment is spread first and this is added to it. A
   * member who asks for an expert they do not hold gets an empty list, which is correct,
   * rather than that expert's archive.
   */
  const expertSlug = searchParams.expert?.trim() || null
  const expert = expertSlug
    ? await db.author.findUnique({
        where: { slug: expertSlug },
        select: { name: true, slug: true },
      })
    : null
  // Null section filter = all-access, which is every member who has not bought a
  // single section. The copy below follows the same distinction.
  const everything = visible.sectionId === undefined

  // Nothing is ever deleted (requirement 3), so the archive is simply every published
  // report. Loading them up front keeps filtering instant and client-side.
  const reports = await db.report.findMany({
    where: {
      published: true,
      ...visible,
      ...(expert ? { section: { author: { slug: expert.slug } } } : {}),
    },
    orderBy: { publishDate: 'desc' },
    select: {
      id: true,
      type: true,
      title: true,
      summary: true,
      publishDate: true,
      // Who wrote it, for the label above the title. One join rather than a second query
      // per card — see the note in components/report-card.
      section: { select: { author: { select: { name: true } } } },
    },
  })

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="mb-8">
        {expert ? (
          <>
            <Link
              href="/dashboard"
              className="font-mono text-[12px] text-ink-dim transition-colors hover:text-ink"
            >
              ← Your experts
            </Link>
            <h1 className="mt-4 text-3xl text-ink sm:text-4xl">{expert.name}</h1>
            <p className="mt-3 max-w-lg text-[16px] leading-relaxed text-ink-dim">
              Everything of theirs you can read, including editions published before you
              joined.
            </p>
            {/*
              The way to the person, which the portal did not have.

              An expert's profile — their background, what they cover, what else they sell
              — lives at /experts/<slug>, and every route to it was outside the member
              area: the card on the dashboard opens this list, the member nav is Reports,
              Archive, Tools and Account, and the portal's own footer is the disclaimer
              rather than the marketing one. A member who wanted to know who they were
              reading had to guess the URL.

              Here rather than on the card, where "View reports" is the one action and a
              second link beside it would compete with it. This page is one click from the
              card and already about this one person.
            */}
            <Link
              href={`/experts/${expert.slug}`}
              className="mt-4 inline-flex items-center gap-1.5 text-[14px] text-accent underline underline-offset-4 transition-colors hover:text-accent-hover"
            >
              About {expert.name}
            </Link>
          </>
        ) : (
          <>
            <span className="eyebrow">Everything published</span>
            <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Report archive</h1>
            <p className="mt-3 max-w-lg text-[16px] leading-relaxed text-ink-dim">
              {everything
                ? 'Every report ever published, including editions from before you joined.'
                : 'Every report in the sections you subscribe to, including editions published before you joined.'}
            </p>
          </>
        )}
      </div>

      <ArchiveBrowser
        reports={reports.map((report) => ({
          ...report,
          publishDate: report.publishDate.toISOString(),
          authorName: report.section?.author.name ?? null,
        }))}
      />
    </div>
  )
}
