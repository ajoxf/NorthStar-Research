import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { ReportUploadForm } from '@/app/admin/reports/new/report-upload-form'
import { getCurrentMember } from '@/lib/auth'
import { db } from '@/lib/db'
import { authorForMember } from '@/lib/expert-account'
import { sectionName } from '@/lib/section-shape'

export const metadata: Metadata = { title: 'Upload a report', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * An expert uploads an edition of their own. The same form the desk uses, filed only into
 * their own live sections, and saved for review: an admin publishes it, or sends it back.
 */
export default async function ExpertNewReportPage() {
  const member = await getCurrentMember()
  if (!member) redirect('/login?next=/expert/reports/new')
  const author = await authorForMember(member.id)
  if (!author) notFound()

  const sections = await db.section.findMany({
    where: { authorId: author.id, archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    include: { topic: true, author: true },
  })

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <Link href="/expert#reports" className="mb-6 flex w-fit items-center gap-1.5 text-[14px] text-ink-dim hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to your page
      </Link>
      <span className="eyebrow">Subject matter expert</span>
      <h1 className="mt-3 text-3xl text-ink">Upload a report</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
        It goes to the team for review first. Nothing reaches your subscribers until they publish it — if something needs
        changing, they will send it back with a note.
      </p>
      {sections.length === 0 ? (
        <p className="panel mt-8 p-6 text-[15px] text-ink-dim">
          You have no section on sale yet, so there is nowhere to publish a report. The team sets sections up — ask them.
        </p>
      ) : (
        <ReportUploadForm mode="expert" sections={sections.map((section) => ({ id: section.id, name: sectionName(section) }))} />
      )}
    </div>
  )
}
