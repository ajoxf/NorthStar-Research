import { db } from '@/lib/db'

/**
 * Give every section a grantable item, and every entitlement the item its section points at.
 *
 * **Why this exists.** A section is sold through an Item: entitlements point at items,
 * packages are made of items, and trials are switched on per item. Sections created before
 * items existed — and, for a while, sections created through the admin — have none, which
 * makes them invisible to all three. They can be priced and displayed and never bundled or
 * trialled, a failure that surfaces a long way from its cause.
 *
 * **No `server-only` guard, deliberately.** This is imported by an admin API route *and*
 * by scripts/backfill-items.ts, which runs under tsx outside Next. Adding the guard would
 * break the command-line path, which is the one that still works when the site does not.
 *
 * **It is idempotent.** Every write is keyed on something unique and skipped when it is
 * already there, so a second run reports zeroes rather than making a second copy of
 * anything. That is what makes the honest way to run it — run, read the numbers, run again
 * to confirm they went to zero — actually work.
 *
 * It never deletes. The only rows it creates are items, and the only columns it fills are
 * ones that were null, with a single narrow exception: an item whose name is exactly its
 * section's slug is renamed, because that string is what an earlier version of this code
 * wrote and is not a label anybody would have chosen.
 */

/** A section's item slug. Prefixed so a section and a product can never collide. */
export const sectionItemSlug = (slug: string): string => `section-${slug}`

/**
 * Products that must exist as items.
 *
 * Listed in code rather than typed into the database by hand so a fresh environment ends
 * up with the same handles the rest of the code checks against.
 */
const PRODUCTS = [{ slug: 'nexus-ramp', name: 'Nexus RAMP' }] as const

export type RepairReport = {
  dryRun: boolean
  itemsCreated: number
  itemsRenamed: number
  sectionsLinked: number
  entitlementsLinked: number
  /** Still unresolved afterwards. Above zero on a real run means something needs a person. */
  entitlementsUnresolved: number
  /** One line per thing that could not be settled automatically. */
  warnings: string[]
  /** True when a real run would change nothing — the state you want to end on. */
  clean: boolean
}

/**
 * Put an item's name back in step with the section it belongs to.
 *
 * A section's display name is *derived* — "Energy by Dean Rogers" is its topic and its
 * author, computed at render. The item's name is *stored*, because a package's contents
 * list has to read as names without joining out to two tables per row. So renaming a topic
 * or an expert changes what every page calls the section and leaves the item still saying
 * what it was called the day it was made.
 *
 * Called from the topic, author and section edit routes. Cheap: one query per affected
 * section, and only when a name actually changed.
 */
export async function syncItemNames(sectionIds: string[]): Promise<number> {
  if (sectionIds.length === 0) return 0

  const sections = await db.section.findMany({
    where: { id: { in: sectionIds }, itemId: { not: null } },
    select: {
      itemId: true,
      displayName: true,
      topic: { select: { name: true } },
      author: { select: { name: true } },
      item: { select: { name: true } },
    },
  })

  let renamed = 0
  for (const section of sections) {
    const name =
      section.displayName?.trim() || `${section.topic.name} by ${section.author.name}`
    if (!section.itemId || section.item?.name === name) continue
    await db.item.update({ where: { id: section.itemId }, data: { name } })
    renamed += 1
  }
  return renamed
}

export async function repairSections({ dryRun }: { dryRun: boolean }): Promise<RepairReport> {
  let itemsCreated = 0
  let itemsRenamed = 0
  let sectionsLinked = 0
  let entitlementsLinked = 0
  const warnings: string[] = []

  // ---- 1. one item per section -------------------------------------------------
  //
  // The item's NAME is the label beside every checkbox in a package's contents, so it has
  // to read the way the rest of the site writes a section — "Energy by Dean Rogers" — and
  // not as a URL handle.
  const sections = await db.section.findMany({
    select: {
      id: true,
      slug: true,
      displayName: true,
      itemId: true,
      topic: { select: { name: true } },
      author: { select: { name: true } },
    },
  })

  for (const section of sections) {
    const slug = sectionItemSlug(section.slug)
    const name =
      section.displayName?.trim() || `${section.topic.name} by ${section.author.name}`

    if (section.itemId) {
      // Already linked. Only its name is in question — and only when it is the bare slug,
      // which is this code's own past output rather than anybody's decision.
      const current = await db.item.findUnique({
        where: { id: section.itemId },
        select: { name: true },
      })
      if (current && current.name === section.slug && current.name !== name) {
        itemsRenamed += 1
        if (!dryRun) await db.item.update({ where: { id: section.itemId }, data: { name } })
      }
      continue
    }

    const existing = await db.item.findUnique({ where: { slug }, select: { id: true } })
    if (!existing) {
      itemsCreated += 1
      if (!dryRun) await db.item.create({ data: { kind: 'section', slug, name } })
    }

    sectionsLinked += 1
    if (!dryRun) {
      const item = await db.item.findUnique({ where: { slug }, select: { id: true } })
      if (item) await db.section.update({ where: { id: section.id }, data: { itemId: item.id } })
    }
  }

  // ---- 2. the products ----------------------------------------------------------
  for (const product of PRODUCTS) {
    const existing = await db.item.findUnique({
      where: { slug: product.slug },
      select: { id: true },
    })
    if (existing) continue
    itemsCreated += 1
    if (!dryRun) await db.item.create({ data: { kind: 'product', ...product } })
  }

  // ---- 3. every entitlement points at its section's item -------------------------
  //
  // One at a time rather than a single UPDATE ... FROM, so the count is honest and a row
  // that cannot be resolved is named rather than silently skipped.
  const orphaned = await db.entitlement.findMany({
    where: { itemId: null },
    select: { id: true, sectionId: true },
  })

  for (const entitlement of orphaned) {
    if (!entitlement.sectionId) {
      warnings.push(
        `Entitlement ${entitlement.id} has neither a section nor an item, so there is nothing ` +
          `to point it at. Left alone.`,
      )
      continue
    }

    const section = await db.section.findUnique({
      where: { id: entitlement.sectionId },
      select: { itemId: true },
    })

    if (!section?.itemId) {
      /*
       * On a dry run this is expected and not a problem: step 1 wrote nothing, so the item
       * this row would point at does not exist yet. On a real run it means something is
       * genuinely wrong, and the count below says so.
       */
      if (!dryRun) {
        warnings.push(
          `Entitlement ${entitlement.id} points at a section that still has no item.`,
        )
      }
      continue
    }

    entitlementsLinked += 1
    if (!dryRun) {
      await db.entitlement.update({
        where: { id: entitlement.id },
        data: { itemId: section.itemId },
      })
    }
  }

  const entitlementsUnresolved = await db.entitlement.count({ where: { itemId: null } })

  return {
    dryRun,
    itemsCreated,
    itemsRenamed,
    sectionsLinked,
    entitlementsLinked,
    // After a real run this is the honest figure. After a dry run it still counts the rows
    // step 3 has not written yet, which is why the UI reads it only when dryRun is false.
    entitlementsUnresolved: dryRun ? 0 : entitlementsUnresolved,
    warnings,
    clean:
      itemsCreated === 0 && itemsRenamed === 0 && sectionsLinked === 0 && entitlementsLinked === 0,
  }
}
