import 'server-only'

import { getCurrentMember } from '@/lib/auth'
import { readSetting, writeSetting } from '@/lib/secure-settings'

/**
 * Whether the sections surface is visible to the public.
 *
 * A stored setting rather than a deploy, for the same reason the pricing mode is one: this
 * is a commercial posture, and it has to be reversible in one click by whoever runs the
 * business rather than by whoever can push code.
 *
 * What it gates is **visibility, not access**. The contributor pages, the coverage
 * browser and the footer links appear when it is on and 404 when it is off. It does not
 * touch `canReadReport`, which is always evaluated the same way — a flag that could change
 * who may read a report would be a flag that opens the archive by accident.
 *
 * The point of it is that authors, sections, prices and report tagging can all be set up
 * on the live site, at leisure, while members continue to see exactly what they saw
 * yesterday. Turning it on is then a decision rather than a race.
 */
export const SECTIONS_PUBLIC_KEY = 'sections.public'

/**
 * Defaults to hidden.
 *
 * The safer of the two: a half-configured contributors page shown to the public is the
 * mistake that cannot be taken back, while a hidden one is one click from being shown.
 */
export async function sectionsPublic(): Promise<boolean> {
  return (await readSetting(SECTIONS_PUBLIC_KEY)) === 'true'
}

export async function setSectionsPublic(value: boolean, adminId: string): Promise<void> {
  await writeSetting(SECTIONS_PUBLIC_KEY, value ? 'true' : 'false', adminId)
}

/**
 * What the person currently looking should see.
 *
 * An admin sees the sections pages even while they are hidden, which is the whole point
 * of hiding them: setting up authors, prices and descriptions and then flipping a switch
 * blind — discovering what the pages look like at the same moment your visitors do — is
 * not a launch, it is a gamble. The first version of this flag 404'd the pages for
 * everybody including the operator, which made "preview before publishing" impossible.
 *
 * `preview` is true only in that case, so the pages can say plainly that what is on
 * screen is not what the public can reach.
 */
export async function sectionsVisibility(): Promise<{ visible: boolean; preview: boolean }> {
  if (await sectionsPublic()) return { visible: true, preview: false }

  const member = await getCurrentMember()
  const isAdmin = member?.role === 'admin'
  return { visible: isAdmin, preview: isAdmin }
}
