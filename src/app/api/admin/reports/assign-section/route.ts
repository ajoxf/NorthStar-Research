import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * File the untagged back catalogue into a section, in one go.
 *
 * Every report published before sections existed carries no section, which means only
 * all-access members can read it. That is a safe default and a poor permanent state: the
 * archive is most of what a new contributor's package is worth, and it cannot be sold
 * while it belongs to nobody.
 *
 * **Only reports with no section are touched.** A report already filed is left exactly as
 * it is, including one filed under a different contributor — this is a backfill, not a
 * reassignment, and the difference matters when somebody clicks it twice.
 *
 * Nobody loses access either way. All-access is checked before sections are consulted, so
 * tagging a report only adds the members who bought that section to the set that can read
 * it. Nothing is deleted and any single report can still be moved afterwards from its own
 * edit screen.
 */
const schema = z.object({
  sectionId: z.string().trim().min(1, 'Choose a section.'),
  /** Guard against a stale screen: how many rows the operator was told they were moving. */
  expected: z.number().int().min(0).optional(),
})

export async function POST(request: Request) {
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

  const section = await db.section.findUnique({
    where: { id: parsed.data.sectionId },
    select: { id: true, archivedAt: true },
  })
  if (!section) {
    return NextResponse.json(
      { error: 'That section no longer exists. Reload the page and choose again.' },
      { status: 400 },
    )
  }
  if (section.archivedAt !== null) {
    return NextResponse.json(
      { error: 'That section has been withdrawn from sale, so nothing can be filed into it.' },
      { status: 400 },
    )
  }

  const untagged = await db.report.count({ where: { sectionId: null } })

  /*
   * Refused rather than reconciled when the figure has moved.
   *
   * The operator agreed to move a number they read on screen. If a report has been
   * uploaded or filed since, the real number is different, and quietly moving more than
   * they were shown is how a bulk action becomes something nobody meant to do.
   */
  if (parsed.data.expected !== undefined && parsed.data.expected !== untagged) {
    return NextResponse.json(
      {
        error:
          `There are now ${untagged} unfiled reports, not ${parsed.data.expected}. ` +
          'Reload the page and check the number before filing them.',
      },
      { status: 409 },
    )
  }

  const result = await db.report.updateMany({
    where: { sectionId: null },
    data: { sectionId: section.id },
  })

  return NextResponse.json({ ok: true, moved: result.count })
}
