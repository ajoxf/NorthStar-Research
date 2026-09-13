import { NextResponse } from 'next/server'
import { z } from 'zod'

import { ForbiddenError, requireAdmin } from '@/lib/auth'
import { db } from '@/lib/db'
import { clampDays, migrateLegacyTrialSettings, setItemTrial, setResearchTrial } from '@/lib/trial'
import { RESEARCH_TRIAL_SLUG } from '@/lib/research-trial'
import { offerUsable } from '@/lib/trial-offer-shape'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Open or close the free trial of ONE item.
 *
 * One item at a time, because the offers are independent: opening a trial of a second
 * product must not touch the first, which is exactly what the previous global switch did.
 *
 * `days` null means "use the house default", so an operator who wants every trial to move
 * together leaves them all blank and changes the default once.
 */
const schema = z.object({
  itemSlug: z.string().trim().min(1),
  enabled: z.boolean(),
  days: z.number().int().min(1).max(365).nullable(),
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
    return NextResponse.json(
      { error: 'Check the trial length — 1 to 365 days, or blank for the default.' },
      { status: 400 },
    )
  }

  /*
   * The research membership is settings, not an item, so it never reaches the lookup
   * below — there is no row with this slug and the lookup would refuse it as archived.
   */
  if (parsed.data.itemSlug === RESEARCH_TRIAL_SLUG) {
    await setResearchTrial(
      { enabled: parsed.data.enabled, days: parsed.data.days },
      admin.id,
    )
    return NextResponse.json({
      ok: true,
      item: { slug: RESEARCH_TRIAL_SLUG, trialEnabled: parsed.data.enabled, trialDays: parsed.data.days },
    })
  }

  /*
   * The item has to exist and be on the shelf before its trial can be switched on.
   *
   * Without this an operator saves a slug with a typo in it, sees the switch say Open, and
   * advertises a signup that refuses every person who reaches it. The signup route would
   * refuse them correctly — but the place to catch it is here, once, not silently on each
   * visitor.
   */
  const item = await db.item.findUnique({
    where: { slug: parsed.data.itemSlug },
    select: { archivedAt: true, kind: true, section: { select: { archivedAt: true } } },
  })
  if (!offerUsable(item)) {
    return NextResponse.json(
      { error: 'That does not exist, or has been archived.' },
      { status: 400 },
    )
  }

  // Before writing, so an operator's first switch does not race the migration and get
  // overwritten by the legacy setting a moment later.
  await migrateLegacyTrialSettings()

  await setItemTrial(parsed.data.itemSlug, {
    enabled: parsed.data.enabled,
    days: parsed.data.days === null ? null : clampDays(parsed.data.days),
  })

  const saved = await db.item.findUnique({
    where: { slug: parsed.data.itemSlug },
    select: { slug: true, trialEnabled: true, trialDays: true },
  })
  return NextResponse.json({ ok: true, item: saved })
}
