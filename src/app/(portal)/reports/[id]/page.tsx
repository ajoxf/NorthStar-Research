import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

import { ReportReader } from '@/components/report-reader'
import { Badge } from '@/components/ui/badge'
import { getCurrentMember, memberCanReadReport, memberHasAnyAccess, requestFingerprint } from '@/lib/auth'
import { db } from '@/lib/db'
import { expertOwnsReport } from '@/lib/expert-reports'
import { mintReportToken } from '@/lib/report-access'
import { parseInstruments, reportTypeMeta } from '@/lib/report-content'
import { formatDate } from '@/lib/utils'

export const metadata: Metadata = { title: 'Report' }
export const dynamic = 'force-dynamic'

/**
 * The route every emailed link resolves to (build spec §5.5).
 *
 * An anonymous request never renders report content: it is bounced to /login with a
 * `next` param so the member lands back here after signing in. That is the whole
 * mechanism by which a forwarded link is worthless to whoever receives it.
 */
export default async function ReportPage({ params }: { params: { id: string } }) {
  const member = await getCurrentMember()
  if (!member) redirect(`/login?next=${encodeURIComponent(`/reports/${params.id}`)}`)

  const report = await db.report.findUnique({ where: { id: params.id } })

  /*
   * A subject matter expert reading their own work: something they submitted, or anything
   * in a section of theirs. They see exactly what a member sees, at any stage and without a
   * subscription — and their look is not a read, so it is left out of the statistics.
   */
  const ownPreview = report ? await expertOwnsReport(member.id, report) : false

  if (!ownPreview && !(await memberHasAnyAccess(member))) redirect('/dashboard')
  if (!report) notFound()

  // Admins can preview an unpublished report; members cannot see it at all.
  if (!report.published && member.role !== 'admin' && !ownPreview) notFound()

  /*
   * Checked after the report is loaded, because the question is about this edition and
   * not about membership in general — somebody who bought "Energy by Sarah" is a paying
   * member looking at a report they have not paid for.
   *
   * Sent to the dashboard rather than shown a 404: they exist, this report exists, and
   * pretending otherwise to a paying member is a worse answer than showing them what
   * they do have. The ReportView below is only written once this passes, so a blocked
   * attempt never lands in the read statistics.
   */
  if (!ownPreview && !(await memberCanReadReport(member, report))) redirect('/dashboard?locked=1')

  if (!ownPreview) {
    const { tokenId } = await mintReportToken(member.id, report.id)
    const { ipAddress, userAgent } = requestFingerprint()

    // Audit trail behind the §7 mitigations: repeated access from many distinct IPs on one
    // account is what the admin CRM view surfaces for review.
    await db.reportView.create({
      data: { reportId: report.id, memberId: member.id, ipAddress, userAgent, signedTokenId: tokenId },
    })
    await db.member.update({
      where: { id: member.id },
      data: { lastReportViewedAt: new Date() },
    })
  }

  const meta = reportTypeMeta(report.type)
  const instruments = parseInstruments(report.instruments)

  return (
    <article className="mx-auto max-w-3xl px-5 py-10">
      <Link
        href={ownPreview ? '/expert#reports' : '/dashboard'}
        className="mb-8 inline-flex items-center gap-1.5 text-[14px] text-ink-dim transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
        {ownPreview ? 'Your reports' : 'All reports'}
      </Link>

      {ownPreview && (
        <p className="mb-6 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-[14px] leading-relaxed text-ink">
          {report.published
            ? 'This is how your subscribers see this report. Your own views are not counted as reads.'
            : 'Preview — not published yet. This is exactly how your subscribers will see it once the team publishes it.'}
        </p>
      )}

      <header className="mb-10 border-b border-line pb-8">
        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          {meta && (
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent-ink">
              {meta.shortLabel}
            </span>
          )}
          {!report.published && <Badge tone="accent">{ownPreview ? 'Not published yet' : 'Draft preview'}</Badge>}
        </div>

        <h1 className="text-balance text-3xl leading-tight text-ink sm:text-4xl">{report.title}</h1>

        <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-dim">
          Published {formatDate(report.publishDate, { weekday: 'long' })}
        </p>

        {report.summary && (
          <p className="mt-5 text-[17px] leading-relaxed text-ink-dim">{report.summary}</p>
        )}
      </header>

      <ReportReader
        reportId={report.id}
        watermarkLabel={`${member.email} · ${member.id.slice(-6)}`}
        instruments={instruments}
        htmlContent={report.htmlContent}
        hasPdf={Boolean(report.pdfBlobUrl)}
      />
    </article>
  )
}
