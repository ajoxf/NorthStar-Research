import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { z } from 'zod'

import { db } from '@/lib/db'
import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { MissingConfigError, requireEnv } from '@/lib/env'
import { sanitiseReportHtml } from '@/lib/pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// PDF parsing on a large upload can exceed the default 10s function budget.
export const maxDuration = 60

const schema = z.object({
  // Must stay in sync with REPORT_TYPES and the Prisma ReportType enum, both of which
  // carry four values. Omitting fx_currencies made Report 4 impossible to upload: the
  // form offered it and the API rejected it with a bare validation error.
  type: z.enum(['commodities', 'international_markets', 'options_crypto_spread', 'fx_currencies']),
  title: z.string().trim().min(3).max(200),
  summary: z.string().trim().max(600).optional(),
  publishDate: z.string().min(4),
  htmlContent: z.string().optional(),
  instruments: z.string().optional(),
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
    type: form.get('type'),
    title: form.get('title'),
    summary: form.get('summary') || undefined,
    publishDate: form.get('publishDate'),
    htmlContent: form.get('htmlContent') || undefined,
    instruments: form.get('instruments') || undefined,
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

  const file = form.get('pdf')
  let pdfBlobUrl: string | null = null
  let pdfBlobPathname: string | null = null
  // Surfaced to the operator when something about the upload needs saying.
  let warning: string | null = null

  if (file instanceof File && file.size > 0) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Upload a PDF file.' }, { status: 400 })
    }

    // Vercel caps a serverless request body at ~4.5 MB. Past that the platform rejects
    // the request before this handler runs, so the operator sees an opaque network
    // failure with nothing to act on. Check just under the limit and name the size.
    const MAX_PDF_BYTES = 4 * 1024 * 1024
    if (file.size > MAX_PDF_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1)
      return NextResponse.json(
        {
          error:
            `That PDF is ${mb} MB and the upload limit is 4 MB. Compress it — any ` +
            `"reduce PDF size" tool works — and upload it again.`,
        },
        { status: 413 },
      )
    }

    const buffer = await file.arrayBuffer()

    try {
      requireEnv('BLOB_READ_WRITE_TOKEN', 'Report file storage (Vercel Blob)')

      const blob = await put(`reports/${Date.now()}-${slugify(parsed.data.title)}.pdf`, buffer, {
        access: 'public',
        contentType: 'application/pdf',
        // NOTE: Vercel Blob only offers public URLs. That URL is never given to a member —
        // downloads are proxied through /api/reports/[id]/file behind a short-lived
        // signed token — but it does mean the raw URL must be treated as a secret.
        addRandomSuffix: true,
      })

      pdfBlobUrl = blob.url
      pdfBlobPathname = blob.pathname
    } catch (error) {
      if (error instanceof MissingConfigError) {
        return NextResponse.json(
          { error: 'File storage is not configured for this deployment, so the PDF was not saved.' },
          { status: 503 },
        )
      }
      console.error('[admin:reports] blob upload failed', error)
      return NextResponse.json({ error: 'The PDF could not be uploaded.' }, { status: 502 })
    }

    // A PDF on its own is now a complete report: the member's reader renders it as a
    // book and lifts the charts out of it per instrument. Nothing further is required,
    // and nothing is auto-generated from the file's text — see src/lib/pdf-sections.ts.
  }

  const htmlContent = parsed.data.htmlContent?.trim()
    ? sanitiseReportHtml(parsed.data.htmlContent)
    : null

  const report = await db.report.create({
    data: {
      type: parsed.data.type,
      title: parsed.data.title,
      summary: parsed.data.summary || null,
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

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'report'
  )
}
