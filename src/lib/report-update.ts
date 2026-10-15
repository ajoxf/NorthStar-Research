import 'server-only'

import { z } from 'zod'

import { db } from '@/lib/db'
import { sanitiseReportHtml } from '@/lib/pdf'
import type { ReportActor } from '@/lib/report-create'
import { isReportBlobUrl, looksLikePdf } from '@/lib/report-upload'

/**
 * Editing a report after it was uploaded — shared by the desk and by an expert editing
 * their own submission, so both go through the same checks (real PDF, sanitised reading
 * view, a section that exists). Who may edit which report is decided by the caller; this
 * only adds the expert's filing rule: their own live sections, never all-access.
 */

export const reportUpdateSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  summary: z.string().trim().max(600).nullable().optional(),
  shareHook: z.string().trim().max(200).nullable().optional(),
  publishDate: z.string().optional(),
  htmlContent: z.string().nullable().optional(),
  instruments: z.string().optional(),
  /**
   * Which section this edition belongs to, and therefore who may read it.
   *
   * Explicitly nullable so a report can be moved back to the all-access catalogue. Null
   * is a real answer here, not a missing one — see the note on Report.sectionId.
   */
  sectionId: z.string().min(1).nullable().optional(),
  /**
   * The edition PDF, attached after the report was created.
   *
   * Absent until now, which meant a report saved without a document could never be given
   * one: the only upload on the site was on the create form, and the edit screen's own
   * warning told an operator to "upload the edition PDF below" next to nothing that could.
   * The only way out was to delete the report and start again, losing its section, its
   * publish date and anything already written on it.
   *
   * Validated exactly as the create route validates it — same prefix check, same look at
   * the bytes — because an edit is not a lesser write than a create.
   */
  pdfBlobUrl: z.string().min(1).optional(),
  pdfBlobPathname: z.string().min(1).optional(),
})

export type UpdateResult = { ok: true; reportId: string } | { ok: false; error: string; status: number }

export async function updateReport(reportId: string, input: unknown, actor: ReportActor): Promise<UpdateResult> {
  const parsed = reportUpdateSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the values you entered.', status: 400 }
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.title !== undefined) data.title = parsed.data.title
  if (parsed.data.summary !== undefined) data.summary = parsed.data.summary || null
  if (parsed.data.shareHook !== undefined) data.shareHook = parsed.data.shareHook || null
  if (parsed.data.htmlContent !== undefined) {
    data.htmlContent = parsed.data.htmlContent ? sanitiseReportHtml(parsed.data.htmlContent) : null
  }

  /*
   * The PDF, checked before it is recorded.
   *
   * `isReportBlobUrl` first: without it this field accepts any URL, and a report would
   * happily point at somebody else's host — or at the authors' blob prefix, which is a
   * different security boundary. Then the bytes, because a browser derives `file.type`
   * from the extension and anything renamed to `.pdf` satisfies every check made before
   * this one.
   *
   * A failed *check* is not a failed upload: `unknown` means the store could not be
   * reached, and refusing the edit because a verification request timed out would trade a
   * rare bad file for an outage.
   */
  if (parsed.data.pdfBlobUrl !== undefined) {
    if (!isReportBlobUrl(parsed.data.pdfBlobUrl)) {
      return { ok: false, error: 'That file location is not a report upload. Choose the PDF again.', status: 400 }
    }
    if ((await looksLikePdf(parsed.data.pdfBlobUrl)) === 'not-pdf') {
      return {
        ok: false,
        error: 'That file is not a PDF. It may have been renamed rather than converted — export it as a PDF and upload it again.',
        status: 400,
      }
    }
    data.pdfBlobUrl = parsed.data.pdfBlobUrl
    /*
     * A replaced PDF leaves the old blob where it is.
     *
     * Deleting it here would save a little storage and risk destroying the only copy of a
     * document if anything about this write is wrong. Nothing on this site is ever deleted
     * as a side effect of something else; the delete route removes a report's blob because
     * removing the report is what an operator asked for there.
     */
    if (parsed.data.pdfBlobPathname !== undefined) {
      data.pdfBlobPathname = parsed.data.pdfBlobPathname
    }
  }

  if (parsed.data.publishDate) {
    const publishDate = new Date(parsed.data.publishDate)
    if (Number.isNaN(publishDate.getTime())) {
      return { ok: false, error: 'Enter a valid publish date.', status: 400 }
    }
    data.publishDate = publishDate
  }

  if (parsed.data.sectionId !== undefined) {
    // An expert keeps their report in one of their own live sections, never all-access.
    if (actor.kind === 'expert' && parsed.data.sectionId === null) {
      return { ok: false, error: 'Choose which of your sections this report is for.', status: 400 }
    }
    if (parsed.data.sectionId !== null) {
      const section = await db.section.findUnique({ where: { id: parsed.data.sectionId } })
      if (!section || (actor.kind === 'expert' && (section.authorId !== actor.authorId || section.archivedAt))) {
        return { ok: false, error: 'That section no longer exists.', status: 400 }
      }
    }
    /*
     * Moving a published report between sections changes who can read it, immediately and
     * in both directions. That is the intended behaviour — a report filed in the wrong
     * place should be fixable — but it is worth being clear that this is an access change
     * and not only a label: members of the old section lose it, members of the new one
     * gain it, and the delivery already sent to the old section is not recalled.
     */
    data.sectionId = parsed.data.sectionId
  }

  if (parsed.data.instruments !== undefined) {
    if (parsed.data.instruments.trim() === '') {
      data.instruments = null
    } else {
      try {
        data.instruments = JSON.parse(parsed.data.instruments)
      } catch {
        return { ok: false, error: 'The instrument data is not valid JSON.', status: 400 }
      }
    }
  }

  const report = await db.report.update({ where: { id: reportId }, data })
  return { ok: true, reportId: report.id }
}
