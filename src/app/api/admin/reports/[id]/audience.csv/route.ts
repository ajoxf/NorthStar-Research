import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { audienceCsv, isAudienceState } from '@/lib/audience-shape'
import { reportAudience } from '@/lib/report-audience'
import { slugify } from '@/lib/report-upload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The current view, as a file.
 *
 * It exports the filtered group rather than always exporting everyone: an operator who
 * has narrowed to "never read it" and clicks export wants those people, and handing back
 * a longer list than the screen showed is the kind of quiet mismatch that gets emailed to
 * the wrong audience.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return new Response(error.message, { status: 403 })
    }
    throw error
  }

  const report = await db.report.findUnique({
    where: { id: params.id },
    select: { title: true, publishDate: true },
  })
  if (!report) return new Response('No such report.', { status: 404 })

  const state = new URL(request.url).searchParams.get('state')
  const { rows } = await reportAudience(params.id)
  const filtered = state && isAudienceState(state) ? rows.filter((row) => row.state === state) : rows

  const name = `${slugify(report.title) || 'report'}-${state && isAudienceState(state) ? state : 'audience'}.csv`

  return new Response(audienceCsv(filtered), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      // Never cached: this is a list of people that changes as they read.
      'Cache-Control': 'no-store',
    },
  })
}
