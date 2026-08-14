/**
 * Sync the database schema during the Vercel build.
 *
 * Runs `prisma db push`, which reconciles whatever is in the database up to
 * `schema.prisma`. It is idempotent: on a build where nothing changed it is a no-op, so
 * it is safe to run on every deploy.
 *
 * Two deliberate behaviours:
 *
 *   1. **No database configured → skip, don't fail.** A fresh deployment with no Postgres
 *      yet still builds green, which is what lets the site go up before Neon exists. The
 *      skip is logged loudly so a missing database is never silent.
 *
 *   2. **No `--accept-data-loss`.** If a schema change would drop a column or table,
 *      Prisma refuses and the build fails. That is the point: losing member data should
 *      require a human decision, not happen quietly inside a deploy.
 *
 * `db push` is the right tool while the schema is still moving. Once it settles, switch
 * to proper migration files and `prisma migrate deploy` — that gives you a reviewable
 * history and safe rollbacks. Change the command below and commit `prisma/migrations/`.
 */
import { execSync } from 'node:child_process'

const url = process.env.DATABASE_URL

const isPlaceholder =
  !url || url.trim() === '' || url.toUpperCase().includes('REPLACE_ME')

if (isPlaceholder) {
  console.warn('')
  console.warn('  ⚠  DATABASE_URL is not set — skipping the schema sync.')
  console.warn('     The build will succeed, but every page that reads the database will')
  console.warn('     fail at runtime. Provision Postgres (Storage → Create Database → Neon)')
  console.warn('     and redeploy to create the tables.')
  console.warn('')
  process.exit(0)
}

console.log('  → Syncing database schema (prisma db push)…')

try {
  execSync('npx prisma db push --skip-generate', { stdio: 'inherit' })
  console.log('  ✓ Database schema is up to date.')
} catch {
  console.error('')
  console.error('  ✗ Schema sync failed.')
  console.error('    If Prisma reported possible data loss it stopped deliberately rather')
  console.error('    than dropping anything. Review the change and apply it by hand.')
  console.error('')
  process.exit(1)
}
