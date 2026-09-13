import 'server-only'

import { db } from '@/lib/db'
import { readSettings, writeSetting } from '@/lib/secure-settings'
import { brandForItem, offerUsable, type Brand } from '@/lib/trial-offer-shape'
import {
  TRIAL_DAYS_KEY,
  TRIAL_ENABLED_KEY,
  TRIAL_ITEM_KEY,
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
 * The offer as it stands right now: the settings, the item, and whether it is really open.
 *
 * One place that answers "is there a trial, and of what". The signup page, the public
 * status endpoint and the auth chrome all ask this rather than each making the same two
 * queries and the same archived-or-not judgement — three copies of that rule was three
 * chances for the site to advertise an offer it would then refuse.
 */
export type TrialOffer =
  | { open: false }
  | {
      open: true
      days: number
      slug: string
      name: string
      brand: Brand
      isSection: boolean
    }

export async function currentTrialOffer(): Promise<TrialOffer> {
  const settings = await trialSettings()
  if (!settings.enabled) return { open: false }

  const item = await db.item.findUnique({
    where: { slug: settings.itemSlug },
    select: {
      name: true,
      kind: true,
      archivedAt: true,
      section: { select: { archivedAt: true } },
    },
  })
  if (!offerUsable(item) || !item) return { open: false }

  return {
    open: true,
    days: settings.days,
    slug: settings.itemSlug,
    name: item.name,
    brand: brandForItem(item.kind),
    isSection: item.kind === 'section',
  }
}
