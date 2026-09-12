import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { clampDays, setTrialDays, setTrialEnabled, setTrialItem, trialSettings } from '@/lib/trial'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The free trial switch.
 *
 * All three settings are written together because they are one decision: turning trials
 * on without saying what they grant, or for how long, is not a state worth being able to
 * reach from the console.
 */
const schema = z.object({
  enabled: z.boolean(),
  days: z.number().int().min(1).max(365),
  itemSlug: z.string().trim().min(1),
})

export async function PATCH(request: Request) {
  let admin
  try {
    admin = await requireAdmin()
  } catch (error) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    throw error
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Check the trial length and the product.' }, { status: 400 })
  }

  /*
   * The product has to exist before trials can be switched on.
   *
   * Without this an operator can save a slug with a typo in it, see the switch say On,
   * and advertise a signup page that refuses every person who reaches it. The signup route
   * would refuse them correctly — but the place to catch it is here, once, not silently on
   * each visitor.
   */
  const item = await db.item.findUnique({
    where: { slug: parsed.data.itemSlug },
    select: { archivedAt: true, kind: true, section: { select: { archivedAt: true } } },
  })
  // A section carries its own archived flag, and a section item with no section row is a
  // half-finished backfill. Either way there is nothing to offer.
  const usable =
    item &&
    !item.archivedAt &&
    (item.kind !== 'section' || (item.section && !item.section.archivedAt))
  if (!usable) {
    return NextResponse.json(
      { error: 'That does not exist, or has been archived.' },
      { status: 400 },
    )
  }

  await setTrialItem(parsed.data.itemSlug, admin.id)
  await setTrialDays(clampDays(parsed.data.days), admin.id)
  await setTrialEnabled(parsed.data.enabled, admin.id)

  return NextResponse.json({ ok: true, settings: await trialSettings() })
}
