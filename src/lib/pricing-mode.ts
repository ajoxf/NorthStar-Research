import 'server-only'

import { readSetting, writeSetting } from '@/lib/secure-settings'

/**
 * Whether the site shows its price, or asks people to enquire.
 *
 * A stored setting rather than a code change, because this is a commercial posture that
 * moves back and forth — the price came off the public site to be sent individually, and
 * is expected back on it later. Making that a deploy would mean asking an engineer every
 * time the go-to-market changes.
 *
 * `enquiry` hides every public figure and turns the join page into a form. It does not
 * change the price, and it does not touch checkout: a buyer holding a private pricing
 * link still sees the real figure and pays it.
 */
export type PricingMode = 'public' | 'enquiry'

export const PRICING_MODE_KEY = 'pricing.mode'

/**
 * Defaults to `enquiry`.
 *
 * The safer default of the two: showing a price nobody meant to publish is the mistake
 * that cannot be taken back, while a hidden price is one click from being shown.
 */
export async function pricingMode(): Promise<PricingMode> {
  const stored = await readSetting(PRICING_MODE_KEY)
  return stored === 'public' ? 'public' : 'enquiry'
}

export async function setPricingMode(mode: PricingMode, adminId: string): Promise<void> {
  await writeSetting(PRICING_MODE_KEY, mode, adminId)
}
