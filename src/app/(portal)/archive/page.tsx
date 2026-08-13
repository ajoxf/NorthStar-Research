import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { ArchiveBrowser } from '@/app/(portal)/archive/archive-browser'
import { getCurrentMember, hasActiveSubscription } from '@/lib/auth'
import { db } from '@/lib/db'

export const metadata: Metadata = { title: 'Archive' }
export const dynamic = 'force-dynamic'

export default async function ArchivePage() {
  const member = await getCurrentMember()
  if (!member) redirect('/login')
  if (!hasActiveSubscription(member)) redirect('/dashboard')

  // Nothing is ever deleted (requirement 3), so the archive is simply every published
  // report. Loading them up front keeps filtering instant and client-side.
  const reports = await db.report.findMany({
    where: { published: true },
    orderBy: { publishDate: 'desc' },
    select: { id: true, type: true, title: true, summary: true, publishDate: true },
  })

  return (
    <div className="mx-auto max-w-6xl px-5 py-12">
      <div className="mb-8">
        <span className="eyebrow">Everything published</span>
        <h1 className="mt-3 text-3xl text-ink sm:text-4xl">Report archive</h1>
        <p className="mt-3 max-w-lg text-[16px] leading-relaxed text-ink-dim">
          Every report ever published, including editions from before you joined.
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
