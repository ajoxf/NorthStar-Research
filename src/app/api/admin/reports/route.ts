import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { isReportBlobUrl, looksLikePdf } from '@/lib/report-upload'
import { sanitiseReportHtml } from '@/lib/pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  /*
   * Optional, and no longer asked for at upload.
   *
   * Still accepted so an older client, or a future one that wants to categorise, can send
   * it — but a report without one is normal now, not an error. Reports published before
   * this keep the type they were given.
   */
  type: z
    .enum(['commodities', 'international_markets', 'options_crypto_spread', 'fx_currencies'])
    .optional(),
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().max(600).optional(),
  publishDate: z.string().min(4),
  shareHook: z.string().trim().max(200).optional(),
  htmlContent: z.string().optional(),
  instruments: z.string().optional(),
  // Where the browser already put the PDF. Validated below, not trusted as given.
  pdfBlobUrl: z.string().optional(),
  pdfBlobPathname: z.string().optional(),
  /**
   * Which section this edition belongs to, chosen at upload time.
   *
   * Optional, and absent means all-access — the same thing every report published before
   * sections existed means, and the same default the edit screen has always shown. Filing
   * it here rather than only afterwards matters because the gap between the two is a
   * window in which the report is publishable to the wrong audience.
   */
  sectionId: z.string().trim().min(1).optional(),
})

/** Create a report. Upload does not send anything — publishing does (see /publish). */
export async function POST(request: Request) {
  let admin
  try {
    admin = await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const form = await request.formData()
  const parsed = schema.safeParse({
    // `|| undefined`, not the raw value: an absent field is null, and `.optional()`
    // accepts undefined but rejects null — which would fail every upload now that the
    // form no longer sends one.
    type: form.get('type') || undefined,
    title: form.get('title'),
    summary: form.get('summary') || undefined,
    publishDate: form.get('publishDate'),
    shareHook: form.get('shareHook') || undefined,
    htmlContent: form.get('htmlContent') || undefined,
    instruments: form.get('instruments') || undefined,
    pdfBlobUrl: form.get('pdfBlobUrl') || undefined,
    pdfBlobPathname: form.get('pdfBlobPathname') || undefined,
    sectionId: form.get('sectionId') || undefined,
  })

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the report details.' },
      { status: 400 },
    )
  }

  const publishDate = new Date(parsed.data.publishDate)
  if (Number.isNaN(publishDate.getTime())) {
    return NextResponse.json({ error: 'Enter a valid publish date.' }, { status: 400 })
  }

  let instruments: unknown = undefined
  if (parsed.data.instruments?.trim()) {
    try {
      instruments = JSON.parse(parsed.data.instruments)
    } catch {
      return NextResponse.json(
        { error: 'The instrument data is not valid JSON. Fix it and try again.' },
        { status: 400 },
      )
    }
  }

  // Surfaced to the operator when something about the upload needs saying.
  const warning: string | null = null

  /*
   * The PDF is already in Blob storage by the time this runs.
   *
   * The browser uploads it directly — see /api/admin/reports/upload for why. The file
   * never passes through this function, so the ~4.5 MB serverless body limit that made
   * every real report fail to save does not apply to it.
   *
   * A PDF on its own is a complete report: the member's reader renders it as a book and
   * lifts the charts out of it per instrument. Nothing is auto-generated from the file's
   * text — see src/lib/pdf-sections.ts.
   */
  const pdfBlobUrl = typeof parsed.data.pdfBlobUrl === 'string' ? parsed.data.pdfBlobUrl : null
  const pdfBlobPathname =
    typeof parsed.data.pdfBlobPathname === 'string' ? parsed.data.pdfBlobPathname : null

  if (pdfBlobUrl && !isReportBlobUrl(pdfBlobUrl)) {
    return NextResponse.json(
      { error: 'That file location is not a report upload. Choose the PDF again.' },
      { status: 400 },
    )
  }

  /*
   * Is the uploaded file actually a PDF?
   *
   * Every check until now was on the *name*. The form tests `file.type`, the input has an
   * accept filter and the blob store is limited to `application/pdf` — but a browser
   * derives `file.type` from the extension, so anything renamed to `.pdf` satisfies all
   * three and lands in the store labelled as a PDF.
   *
   * What it costs to find out late is the point. Nothing fails at upload; the report is
   * published, emailed, and the first person to discover it is a member who paid, looking
   * at "this document could not be opened". So the bytes are read here, where the person
   * who can fix it is the person being told.
   *
   * A failed *check* is not a failed upload. If the store cannot be reached the report is
   * saved anyway — refusing to publish because a verification request timed out would
   * trade a rare bad file for an outage.
   */
  if (pdfBlobUrl) {
    const verdict = await looksLikePdf(pdfBlobUrl)
    if (verdict === 'not-pdf') {
      return NextResponse.json(
        {
          error:
            'That file is not a PDF. It may have been renamed rather than converted — ' +
            'export it as a PDF and upload it again.',
        },
        { status: 400 },
      )
    }
  }

  const htmlContent = parsed.data.htmlContent?.trim()
    ? sanitiseReportHtml(parsed.data.htmlContent)
    : null

  /*
   * Checked before the write, not left to the foreign key.
   *
   * An unknown id would otherwise surface as a Prisma constraint error — a 500 with a
   * stack trace, after the PDF has already been uploaded — where what an operator needs
   * is to be told the section is gone and to pick another one.
   */
  let sectionId: string | null = null
  if (parsed.data.sectionId) {
    const section = await db.section.findUnique({
      where: { id: parsed.data.sectionId },
      select: { id: true },
    })
    if (!section) {
      return NextResponse.json(
        { error: 'That section no longer exists. Reload the page and choose again.' },
        { status: 400 },
      )
    }
    sectionId = section.id
  }

  const report = await db.report.create({
    data: {
      type: parsed.data.type,
      sectionId,
      title: parsed.data.title,
      summary: parsed.data.summary || null,
      shareHook: parsed.data.shareHook || null,
      publishDate,
      pdfBlobUrl,
      pdfBlobPathname,
      htmlContent,
      instruments: instruments as never,
      createdByAdminId: admin.id,
      published: false,
    },
  })

  return NextResponse.json({ ok: true, reportId: report.id, warning })
}
