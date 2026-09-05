import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { ArchiveBrowser } from '@/app/(portal)/archive/archive-browser'
import { getCurrentMember, memberHasAnyAccess, memberReportWhere } from '@/lib/auth'
import { db } from '@/lib/db'

export const metadata: Metadata = { title: 'Archive' }
export const dynamic = 'force-dynamic'

export default async function ArchivePage() {
  const member = await getCurrentMember()
  if (!member) redirect('/login?next=/archive')
  if (!(await memberHasAnyAccess(member))) redirect('/dashboard')

  const visible = await memberReportWhere(member)
  // Null section filter = all-access, which is every member who has not bought a
  // single section. The copy below follows the same distinction.
  const everything = visible.sectionId === undefined

  // Nothing is ever deleted (requirement 3), so the archive is simply every published
  // report. Loading them up front keeps filtering instant and client-side.
  const reports = await db.report.findMany({
    where: { published: true, ...visible },
    orderBy: { publishDate: 'desc' },
    select: { id: true, type: true, title: true, summary: true, publishDate: true },
  })

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="mb-8">
        <span className="eyebrow">Everything published</span>
        <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Report archive</h1>
        <p className="mt-3 max-w-lg text-[16px] leading-relaxed text-ink-dim">
          {everything
            ? 'Every report ever published, including editions from before you joined.'
            : 'Every report in the sections you subscribe to, including editions published before you joined.'}
        </p>
      </div>

      <ArchiveBrowser
        reports={reports.map((report) => ({
          ...report,
          publishDate: report.publishDate.toISOString(),
        }))}
      />
    </div>
  )
}
