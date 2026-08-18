import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { type ReaderFilter, filterReaders, readerCsv, readerStats } from '@/lib/reader-stats'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FILTERS: ReaderFilter[] = ['all', 'reading', 'quiet', 'never']

/** The current view as a file — the filtered group, not always everyone. */
export async function GET(request: Request) {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) return new Response(error.message, { status: 403 })
    throw error
  }

  const requested = new URL(request.url).searchParams.get('filter')
  const filter = FILTERS.includes(requested as ReaderFilter) ? (requested as ReaderFilter) : 'all'

  const rows = filterReaders(await readerStats(), filter)

  return new Response(readerCsv(rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="readers-${filter}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
