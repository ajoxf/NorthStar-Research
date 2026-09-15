import type { Metadata } from 'next'

import { ReportUploadForm } from '@/app/admin/reports/new/report-upload-form'
import { requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { sectionName } from '@/lib/section-shape'

export const metadata: Metadata = { title: 'Upload a report' }
export const dynamic = 'force-dynamic'

export default async function NewReportPage() {
  await requireAdmin()

  /*
   * Only sections still on sale. Unlike the edit screen — which also includes the
   * report's own retired section so that opening an old edition cannot silently
   * reassign it — a brand new report has no section to preserve, and offering an
   * archived one would be filing work into something nobody can buy.
   */
  const sections = await db.section.findMany({
    where: { archivedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    include: { topic: true, author: true },
  })

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="font-mono text-xl text-ink">Upload a report</h1>
      <p className="mt-1 font-mono text-[12px] text-ink-dim">
        Uploading creates a draft. Nothing is sent to members until you publish it.
      </p>

      <ReportUploadForm
        sections={sections.map((section) => ({ id: section.id, name: sectionName(section) }))}
      />
    </div>
  )
}
