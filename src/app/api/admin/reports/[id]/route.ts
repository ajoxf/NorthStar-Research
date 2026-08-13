import { NextResponse } from 'next/server'
import { z } from 'zod'

import { db } from '@/lib/db'
import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { sanitiseReportHtml } from '@/lib/pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const schema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  summary: z.string().trim().max(600).nullable().optional(),
  publishDate: z.string().optional(),
  htmlContent: z.string().nullable().optional(),
  instruments: z.string().optional(),
})

/**
 * Edit report metadata and content.
 *
 * There is deliberately no DELETE handler on this route: requirement 3 says every report
 * ever published is retained and remains viewable. Un-publishing is the strongest action
 * available, and even that keeps the row and its history intact.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Check the values you entered.' },
      { status: 400 },
    )
  }

  const data: Record<string, unknown> = {}
  if (parsed.data.title !== undefined) data.title = parsed.data.title
  if (parsed.data.summary !== undefined) data.summary = parsed.data.summary || null
  if (parsed.data.htmlContent !== undefined) {
    data.htmlContent = parsed.data.htmlContent ? sanitiseReportHtml(parsed.data.htmlContent) : null
  }

  if (parsed.data.publishDate) {
    const publishDate = new Date(parsed.data.publishDate)
    if (Number.isNaN(publishDate.getTime())) {
      return NextResponse.json({ error: 'Enter a valid publish date.' }, { status: 400 })
    }
    data.publishDate = publishDate
  }

  if (parsed.data.instruments !== undefined) {
    if (parsed.data.instruments.trim() === '') {
      data.instruments = null
    } else {
      try {
        data.instruments = JSON.parse(parsed.data.instruments)
      } catch {
        return NextResponse.json({ error: 'The instrument data is not valid JSON.' }, { status: 400 })
      }
    }
  }

  const report = await db.report.update({ where: { id: params.id }, data })
  return NextResponse.json({ ok: true, reportId: report.id })
}
