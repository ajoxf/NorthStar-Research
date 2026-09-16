import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { repairSections } from '@/lib/section-repair'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Walks every section and entitlement one at a time so the counts are honest; on a large
// archive that is slower than the default ceiling allows.
export const maxDuration = 300

/**
 * Repair sections that have no grantable item.
 *
 * The same work as scripts/backfill-items.ts, from the admin instead of a terminal, and
 * running the same function — one implementation with two doors, rather than two that
 * could drift into disagreeing about what "repaired" means.
 *
 * `dryRun` defaults to **true**. A data repair that runs the moment somebody opens a page
 * is not a repair anybody chose; applying it has to be a separate, deliberate request.
 */
const schema = z.object({ dryRun: z.boolean().default(true) })

export async function POST(request: Request) {
  try {
    await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the request.' }, { status: 400 })
  }

  try {
    return NextResponse.json({ ok: true, ...(await repairSections(parsed.data)) })
  } catch (error) {
    console.error('[admin:sections] repair failed', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `The repair stopped: ${error.message}`
            : 'The repair could not be completed.',
      },
      { status: 500 },
    )
  }
}
