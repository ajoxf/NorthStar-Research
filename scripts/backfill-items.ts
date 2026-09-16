/**
 * Give every section a grantable item, from the command line.
 *
 *   npx tsx scripts/backfill-items.ts --dry-run   # says what it would do, writes nothing
 *   npx tsx scripts/backfill-items.ts             # does it
 *
 * The same repair the admin's "Repair sections" button runs, calling the same function —
 * see src/lib/section-repair.ts, which carries the reasoning. Two entry points, one
 * implementation, because two implementations of a data migration is how they end up
 * disagreeing about what they fixed.
 *
 * Why a script as well as a button: this one still works when the site does not, which is
 * exactly when a repair tends to be wanted.
 *
 * It needs the database in the environment, and Prisma's client does not read .env by
 * itself — only its CLI does. So:
 *
 *   node --env-file=.env ./node_modules/.bin/tsx scripts/backfill-items.ts --dry-run
 *
 * or export DATABASE_URL and DATABASE_URL_UNPOOLED first.
 */
import { db } from '../src/lib/db'
import { repairSections } from '../src/lib/section-repair'

const dryRun = process.argv.includes('--dry-run')

async function main() {
  console.log(dryRun ? '\n  Dry run — nothing will be written.\n' : '\n  Repairing sections.\n')

  const report = await repairSections({ dryRun })

  console.log(`  items created        ${report.itemsCreated}`)
  console.log(`  items renamed        ${report.itemsRenamed}`)
  console.log(`  sections linked      ${report.sectionsLinked}`)
  console.log(`  entitlements linked  ${report.entitlementsLinked}`)
  if (!dryRun) {
    console.log(`  entitlements still without an item  ${report.entitlementsUnresolved}`)
  }

  for (const warning of report.warnings) console.warn(`  ⚠  ${warning}`)

  console.log(
    dryRun
      ? '\n  Nothing was written. Run again without --dry-run to apply.\n'
      : '\n  Done. Run it again — every number above should come back zero.\n',
  )
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
