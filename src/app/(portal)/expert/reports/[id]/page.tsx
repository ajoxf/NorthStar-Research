import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, Check, X } from 'lucide-react'

import { ReportEditor } from '@/app/(portal)/expert/reports/[id]/report-editor'
import { PdfAttach } from '@/app/admin/reports/[id]/pdf-attach'
import { getCurrentMember } from '@/lib/auth'
import { db } from '@/lib/db'
import { authorForMember } from '@/lib/expert-account'
import { editableSubmission } from '@/lib/expert-reports'
import { sectionName } from '@/lib/section-shape'

export const metadata: Metadata = { title: 'Edit your report', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

/**
 * An expert finishing or fixing their own submission: everything the desk can do to a
 * draft before publishing it — every field, the PDF (attached or replaced, shrunk first),
 * and the same readiness checks the desk sees — except publishing itself.
 */
export default async function ExpertEditReportPage({ params }: { params: { id: string } }) {
  const member = await getCurrentMember()
  if (!member) redirect(`/login?next=/expert/reports/${params.id}`)
  const author = await authorForMember(member.id)
  if (!author) notFound()

  const report = await editableSubmission(params.id, author.id)
  if (!report) notFound()

  const sections = await db.section.findMany({
    where: { authorId: author.id, OR: [{ archivedAt: null }, { id: report.sectionId ?? '' }] },
    orderBy: [{ sortOrder: 'asc' }, { slug: 'asc' }],
    include: { topic: true, author: true },
  })

  // What the desk checks before publishing, shown to the expert before they send it.
  const checks = [
    { ok: Boolean(report.pdfBlobUrl), label: 'The report PDF is attached', hint: 'Members read and download the edition from it.' },
    { ok: Boolean(report.htmlContent?.trim()), label: 'Reading view content is written', hint: 'Without it, members on a phone see only a download link.' },
    { ok: Boolean(report.summary?.trim()), label: 'A summary is written', hint: 'It appears on the dashboard card and in the email.' },
    { ok: Boolean(report.sectionId), label: 'Filed in one of your sections', hint: 'Decides who receives it.' },
  ]
  const ready = checks.every((check) => check.ok)

  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <Link href="/expert#reports" className="mb-6 flex w-fit items-center gap-1.5 text-[14px] text-ink-dim hover:text-ink">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        Back to your page
      </Link>
      <span className="eyebrow">{report.reviewStatus === 'rejected' ? 'Sent back — fix and send again' : 'Waiting for review'}</span>
      <h1 className="mt-3 text-3xl text-ink">{report.title}</h1>

      {report.reviewStatus === 'rejected' && report.reviewNote && (
        <p className="mt-5 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-[15px] leading-relaxed text-ink">
          The team's note: {report.reviewNote}
        </p>
      )}

      <section className="mt-6 rounded-lg border border-line bg-panel p-6">
        <h2 className="eyebrow mb-4">Before it can be published</h2>
        <ul className="space-y-3">
          {checks.map((check) => (
            <li key={check.label} className="flex items-start gap-3">
              {check.ok ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-up" aria-label="Done" />
              ) : (
                <X className="mt-0.5 h-4 w-4 shrink-0 text-down" aria-label="Missing" />
              )}
              <span>
                <span className="text-[15px] text-ink">{check.label}</span>
                {!check.ok && <span className="block text-[13px] text-ink-dim">{check.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[14px] text-ink-dim">
          {ready ? 'Everything the team needs is here.' : 'The team can publish without these, but your subscribers get a better report with them.'}
        </p>
      </section>

      <PdfAttach reportId={report.id} title={report.title} hasPdf={Boolean(report.pdfBlobUrl)} mode="expert" />

      <div className="mt-6">
        <ReportEditor
          report={{
            id: report.id,
            title: report.title,
            summary: report.summary,
            shareHook: report.shareHook,
            publishDate: report.publishDate.toISOString().slice(0, 10),
            htmlContent: report.htmlContent,
            instruments: report.instruments ? JSON.stringify(report.instruments, null, 2) : '',
            sectionId: report.sectionId,
            status: report.reviewStatus === 'rejected' ? 'rejected' : 'pending',
          }}
          sections={sections.map((section) => ({ id: section.id, name: sectionName(section) }))}
        />
      </div>
    </div>
  )
}
