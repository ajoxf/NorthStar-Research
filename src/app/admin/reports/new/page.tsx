import type { Metadata } from 'next'

import { ReportUploadForm } from '@/app/admin/reports/new/report-upload-form'
import { requireAdmin } from '@/lib/auth'

export const metadata: Metadata = { title: 'Upload a report' }
export const dynamic = 'force-dynamic'

export default async function NewReportPage() {
  await requireAdmin()

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <h1 className="font-mono text-xl text-ink">Upload a report</h1>
      <p className="mt-1 font-mono text-[12px] text-ink-dim">
        Uploading creates a draft. Nothing is sent to members until you publish it.
      </p>

      <ReportUploadForm />
    </div>
  )
}
