/**
 * Give every existing section an Item, and every existing entitlement an itemId.
 *
 * Why this is a script and not part of the deploy: the build runs `prisma db push`, which
 * reconciles the *shape* of the database and nothing else. It will happily add the Item
 * table and the new nullable columns — it will not put a single row in them. Backfilling
 * inside a build would also mean data being rewritten by whoever happens to deploy next,
 * which is not a decision a deploy should be making.
 *
 * So: run it deliberately, watch what it says, and run it again if you like.
 *
 *   node scripts/backfill-items.mjs --dry-run    # says what it would do, writes nothing
 *   node scripts/backfill-items.mjs              # does it
 *
 * **It is idempotent.** Every write is keyed on something unique and skipped when it is
 * already there, so a second run reports zeroes rather than making a second copy of
 * anything. That matters because the honest way to run a migration against live data is to
 * run it, read the numbers, and run it again to confirm they went to zero.
 *
 * It never deletes and never overwrites: a section that already has an item is left alone,
 * an entitlement that already has an itemId is left alone. The only rows it creates are
 * items, and the only columns it fills are ones that were null.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const dryRun = process.argv.includes('--dry-run')

/** A slug for a section's item. Prefixed so a section and a product can never collide. */
const sectionSlug = (slug) => `section-${slug}`

/**
 * The products that must exist as items.
 *
 * Listed here rather than typed into the database by hand so that a fresh environment —
 * a staging copy, a new developer's machine — ends up with the same handles the code
 * checks against. Adding a product later is a line here and a run of this script, until
 * the admin's own Products page exists.
 */
const PRODUCTS = [
  { slug: 'nexus-ramp', name: 'Nexus RAMP' },
]

async function main() {
  console.log(dryRun ? '\n  Dry run — nothing will be written.\n' : '\n  Backfilling items.\n')

  let itemsCreated = 0
  let sectionsLinked = 0
  let entitlementsLinked = 0

  // ---- 1. one item per section ------------------------------------------------
  const sections = await db.section.findMany({
    select: { id: true, slug: true, displayName: true, itemId: true },
  })

  for (const section of sections) {
    if (section.itemId) continue

    const slug = sectionSlug(section.slug)
    const name = section.displayName ?? section.slug

    const existing = await db.item.findUnique({ where: { slug } })
    if (!existing) {
      itemsCreated++
      if (!dryRun) await db.item.create({ data: { kind: 'section', slug, name } })
    }

    sectionsLinked++
    if (!dryRun) {
      const item = await db.item.findUnique({ where: { slug } })
      await db.section.update({ where: { id: section.id }, data: { itemId: item.id } })
    }
  }

  // ---- 2. the products ---------------------------------------------------------
  for (const product of PRODUCTS) {
    const existing = await db.item.findUnique({ where: { slug: product.slug } })
    if (existing) continue
    itemsCreated++
    if (!dryRun) await db.item.create({ data: { kind: 'product', ...product } })
  }

  // ---- 3. every entitlement points at its section's item ------------------------
  //
  // Done one at a time rather than as a single UPDATE ... FROM so that the count is
  // honest and a row that cannot be resolved is named rather than silently skipped.
  const orphaned = await db.entitlement.findMany({
    where: { itemId: null },
    select: { id: true, sectionId: true },
  })

  for (const entitlement of orphaned) {
    if (!entitlement.sectionId) {
      console.warn(`  ⚠  entitlement ${entitlement.id} has neither a section nor an item — left alone`)
      continue
    }
    const section = await db.section.findUnique({
      where: { id: entitlement.sectionId },
      select: { itemId: true },
    })
    if (!section?.itemId) {
      // Only reachable on a dry run, where step 1 wrote nothing.
      if (!dryRun) console.warn(`  ⚠  section ${entitlement.sectionId} has no item — entitlement ${entitlement.id} left alone`)
      entitlementsLinked++
      continue
    }
    entitlementsLinked++
    if (!dryRun) {
      await db.entitlement.update({ where: { id: entitlement.id }, data: { itemId: section.itemId } })
    }
  }

  // ---- what happened -----------------------------------------------------------
  console.log(`  items created        ${itemsCreated}`)
  console.log(`  sections linked      ${sectionsLinked}`)
  console.log(`  entitlements linked  ${entitlementsLinked}`)

  const left = await db.entitlement.count({ where: { itemId: null } })
  console.log(`  entitlements still without an item  ${left}`)
  console.log(
    dryRun
      ? '\n  Nothing was written. Run again without --dry-run to apply.\n'
      : '\n  Done. Run it again — every number above should come back zero.\n',
  )
}

main()
  .catch((error) => {
    console.error('\n  ✗ Backfill failed. Nothing is half-done that a re-run will not finish.\n')
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
