import { NextResponse } from 'next/server'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { authorWeekPdfFile, pdfResponse } from '@/lib/author-week'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * One author's weekly subscriber figures, as a PDF the desk downloads and sends on. The
 * expert can download the same report from their own page; see author-week.ts.
 */
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const file = await authorWeekPdfFile(params.id)
  if (!file) return NextResponse.json({ error: 'No such author.' }, { status: 404 })
  return pdfResponse(file)
}
