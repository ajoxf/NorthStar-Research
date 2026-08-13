import { NextResponse } from 'next/server'
import { put } from '@vercel/blob'
import { z } from 'zod'

import { db } from '@/lib/db'
import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { MissingConfigError, requireEnv } from '@/lib/env'
import { extractPdfHtml, sanitiseReportHtml } from '@/lib/pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// PDF parsing on a large upload can exceed the default 10s function budget.
export const maxDuration = 60

const schema = z.object({
  type: z.enum(['commodities', 'international_markets', 'options_crypto_spread']),
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
  let generatedHtml: string | null = null
  let warning: string | null = null

  if (file instanceof File && file.size > 0) {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Upload a PDF file.' }, { status: 400 })
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

    // Requirement 12: a PDF alone is not an acceptable delivery format, so derive a
    // responsive reading view from it unless the admin supplied their own.
    if (!parsed.data.htmlContent?.trim()) {
      const extracted = await extractPdfHtml(buffer)
      generatedHtml = extracted.html
      warning = extracted.warning
    }
  }

  const htmlContent = parsed.data.htmlContent?.trim()
    ? sanitiseReportHtml(parsed.data.htmlContent)
    : generatedHtml

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
