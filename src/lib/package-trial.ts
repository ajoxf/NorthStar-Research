import { clampTrialDays } from '@/lib/trial-offer-shape'

/**
 * Free trials of a package.
 *
 * A package is a price and a set of items, so a trial of one is a trial of everything in
 * it at once — several entitlements sharing one end date, rather than the single row an
 * item trial writes. Everything here is pure so the rules can be tested without a
 * database; the grant itself lives in the trial route.
 *
 * The rule that matters most is {@link packageTrialHeldEver}. See its note.
 */

/**
 * The reserved prefix that tells a package offer apart from an item's.
 *
 * Package slugs and item slugs are separate namespaces and nothing stops them colliding —
 * a package called "Energy only" and the Energy section both slugify to something very
 * close. Without a prefix, `trialOfferFor('energy')` would have to guess which table to
 * look in, and guessing wrong grants a free trial of the wrong thing.
 *
 * The same device as RESEARCH_TRIAL_SLUG: a slug shape that can be recognised before any
 * lookup, rather than after one.
 */
export const PACKAGE_TRIAL_PREFIX = 'package:'

export function packageTrialSlug(slug: string): string {
  return `${PACKAGE_TRIAL_PREFIX}${slug}`
}

/** The package slug inside a trial slug, or null when it is not one. */
export function packageSlugFromTrial(slug: string): string | null {
  if (!slug.startsWith(PACKAGE_TRIAL_PREFIX)) return null
  const rest = slug.slice(PACKAGE_TRIAL_PREFIX.length).trim()
  return rest.length > 0 ? rest : null
}

export type TrialItem = {
  id: string
  archivedAt: Date | null
  kind: 'section' | 'product'
  section: { id: string; archivedAt: Date | null } | null
}

/**
 * The items in a package that a trial can actually open.
 *
 * Sections only, and only live ones. A product is excluded for the same reason it is
 * excluded from item trials: it lives on its own domain behind its own sign-in, and this
 * site no longer creates accounts there — so granting one writes an entitlement that opens
 * nothing. An archived item, or a section archived underneath a live item, is off the
 * shelf whatever the package says.
 */
export function grantableItems(items: TrialItem[]): TrialItem[] {
  return items.filter(
    (item) =>
      item.archivedAt === null &&
      item.kind === 'section' &&
      item.section !== null &&
      item.section.archivedAt === null,
  )
}

/**
 * Is a trial of this package open, and for how long?
 *
 * Null when the switch is off, when the package is withdrawn, or when nothing inside it
 * can be opened — that last one deliberately. A package whose sections have all been
 * archived would otherwise advertise a fortnight of nothing, and the person who finds that
 * out is somebody who just created an account for it.
 */
export function packageTrial(
  pkg:
    | {
        trialEnabled: boolean
        trialDays: number | null
        archivedAt: Date | null
        items: TrialItem[]
      }
    | null
    | undefined,
  defaultDays: number,
): { days: number } | null {
  if (!pkg || !pkg.trialEnabled || pkg.archivedAt !== null) return null
  if (grantableItems(pkg.items).length === 0) return null
  return { days: clampTrialDays(pkg.trialDays ?? defaultDays) }
}

/**
 * Has this member ever held ANY part of this package?
 *
 * Any, not all — and this is the load-bearing decision in the file.
 *
 * Packages overlap by design: "Everything by Dean" contains the Energy section, and so
 * does "Energy only". If eligibility asked whether somebody held the whole package, a
 * person could trial the big one, wait for it to lapse, then trial the small one and get a
 * second free run at Energy — repeatedly, for as long as an operator keeps selling
 * overlapping bundles. Asking whether they have held any of it closes that, at the cost of
 * refusing somebody a trial of a bundle when they already hold one section of it. That is
 * the right side to err on: they can buy it, and nothing they already paid for is
 * disturbed.
 *
 * Ever, not currently, matching the item rule — an expired trial still counts, or the
 * trial renews itself for anybody willing to wait.
 */
export function packageTrialHeldEver(
  items: TrialItem[],
  heldItemIds: string[],
  heldSectionIds: string[],
): boolean {
  const heldItems = new Set(heldItemIds)
  const heldSections = new Set(heldSectionIds)
  return items.some(
    (item) => heldItems.has(item.id) || (item.section !== null && heldSections.has(item.section.id)),
  )
}
