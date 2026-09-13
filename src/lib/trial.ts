import 'server-only'

import { db } from '@/lib/db'
import { readSettings, writeSetting } from '@/lib/secure-settings'
import { itemTrial, offerUsable } from '@/lib/trial-offer-shape'
import {
  TRIAL_DAYS_KEY,
  TRIAL_ENABLED_KEY,
  TRIAL_ITEM_KEY,
  TRIAL_MIGRATED_KEY,
  TRIAL_DEFAULTS,
  clampDays,
  parseDays,
  type TrialSettings,
} from '@/lib/trial-shape'

/**
 * The stored half of free trials: reading and writing the three settings.
 *
 * The rules — how long, who may, what to say when the answer is no — are in
 * `trial-shape.ts`, which imports nothing and is therefore testable. This file is only the
 * part that needs the database.
 */

export * from '@/lib/trial-shape'
export * from '@/lib/trial-offer-shape'

/**
 * Trials are **off** unless switched on.
 *
 * The safer default of the two. A trial signup page that is live before the thing it
 * grants access to can actually be opened is a promise the product cannot keep, and the
 * person who finds that out is a prospective customer. Off is one click from on; a bad
 * first impression is not one click from undone.
 */
export async function trialSettings(): Promise<TrialSettings> {
  const raw = await readSettings([TRIAL_ENABLED_KEY, TRIAL_DAYS_KEY, TRIAL_ITEM_KEY])
  return {
    enabled: raw[TRIAL_ENABLED_KEY] === 'true',
    days: parseDays(raw[TRIAL_DAYS_KEY]),
    itemSlug: raw[TRIAL_ITEM_KEY] ?? TRIAL_DEFAULTS.itemSlug,
  }
}

export async function setTrialEnabled(value: boolean, adminId: string): Promise<void> {
  await writeSetting(TRIAL_ENABLED_KEY, value ? 'true' : 'false', adminId)
}

export async function setTrialDays(days: number, adminId: string): Promise<void> {
  await writeSetting(TRIAL_DAYS_KEY, String(clampDays(days)), adminId)
}

export async function setTrialItem(slug: string, adminId: string): Promise<void> {
  await writeSetting(TRIAL_ITEM_KEY, slug.trim(), adminId)
}

/**
 * Every trial that is open right now, one per item.
 *
 * Replaces the single `currentTrialOffer`. That could only describe one offer because the
 * settings behind it could only hold one slug — so opening a trial of a second product
 * closed the first, without saying so, and the customer evaluating the first found out by
 * being refused at the door.
 *
 * Offers do not consult each other. A member may hold a live trial of every product at
 * once; what they may not do is trial the same product twice, which `trialRefusal` has
 * always enforced on whether an entitlement EVER existed, expired ones included.
 */
export type TrialOffer = {
  days: number
  slug: string
  name: string
  isSection: boolean
}

const OFFER_SELECT = {
  slug: true,
  name: true,
  kind: true,
  archivedAt: true,
  trialEnabled: true,
  trialDays: true,
  section: { select: { archivedAt: true } },
} as const

function toOffer(
  item: {
    slug: string
    name: string
    kind: 'section' | 'product'
    archivedAt: Date | null
    trialEnabled: boolean
    trialDays: number | null
    section: { archivedAt: Date | null } | null
  },
  defaultDays: number,
): TrialOffer | null {
  const trial = itemTrial(item, defaultDays)
  if (!trial) return null
  return {
    days: trial.days,
    slug: item.slug,
    name: item.name,
    isSection: item.kind === 'section',
  }
}

export async function trialOffers(): Promise<TrialOffer[]> {
  await migrateLegacyTrialSettings()
  const settings = await trialSettings()
  const items = await db.item.findMany({
    where: { trialEnabled: true, archivedAt: null },
    select: OFFER_SELECT,
    orderBy: { name: 'asc' },
  })
  return items
    .map((item) => toOffer(item, settings.days))
    .filter((offer): offer is TrialOffer => offer !== null)
}

/** One item's offer, or null if it is not on trial. */
export async function trialOfferFor(slug: string): Promise<TrialOffer | null> {
  await migrateLegacyTrialSettings()
  const settings = await trialSettings()
  const item = await db.item.findUnique({ where: { slug }, select: OFFER_SELECT })
  return item ? toOffer(item, settings.days) : null
}

/**
 * Carries the one global trial onto the item it was pointing at, once.
 *
 * Necessary rather than tidy. The old switch lives in the encrypted settings table, so no
 * SQL migration can read it; ship the new columns defaulting to off and a trial that is
 * live right now closes the moment this deploys, with the signup page 404ing under
 * customers already part-way through it.
 *
 * Guarded by its own settings flag rather than by "are all the columns still false",
 * because all-false is also the perfectly ordinary state of having no trials open — using
 * it as the signal would re-open a trial every time an operator closed the last one.
 *
 * Idempotent, and safe to call on every read: after the first run it costs one settings
 * lookup, which that read was making anyway.
 */
export async function migrateLegacyTrialSettings(): Promise<void> {
  try {
    await runLegacyTrialMigration()
  } catch (error) {
    /*
     * Never fatal. This runs from trialOffers(), which the homepage and the login page
     * both call — so a failure here is a failure of those pages, and it was: an invalid
     * foreign key in the write below 500'd nordstarpro.com. Carrying one setting across
     * is a convenience; serving the site is not.
     *
     * The consequence of swallowing it is that trials read as closed until it succeeds,
     * which is the safe direction to fail in — an offer that is not advertised is
     * recoverable, a site that does not load is not.
     */
    console.error('[trial:migrate] could not carry the legacy trial setting across', error)
  }
}

async function runLegacyTrialMigration(): Promise<void> {
  const raw = await readSettings([TRIAL_MIGRATED_KEY])
  if (raw[TRIAL_MIGRATED_KEY] === 'true') return

  /*
   * Null, not a label. updatedByAdminId is a foreign key to Member: it takes the id of
   * somebody who exists, or nothing. No admin did this, so it is nothing.
   */
  const settings = await trialSettings()
  if (settings.enabled && settings.itemSlug) {
    await db.item.updateMany({
      where: { slug: settings.itemSlug },
      data: { trialEnabled: true, trialDays: settings.days },
    })
  }
  await writeSetting(TRIAL_MIGRATED_KEY, 'true', null)
}

export async function setItemTrial(
  slug: string,
  input: { enabled: boolean; days: number | null },
): Promise<void> {
  await db.item.update({
    where: { slug },
    data: {
      trialEnabled: input.enabled,
      trialDays: input.days === null ? null : clampDays(input.days),
    },
  })
}
