import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { isReportBlobUrl } from '@/lib/report-upload'
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

  const htmlContent = parsed.data.htmlContent?.trim()
    ? sanitiseReportHtml(parsed.data.htmlContent)
    : null

  const report = await db.report.create({
    data: {
      type: parsed.data.type,
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
