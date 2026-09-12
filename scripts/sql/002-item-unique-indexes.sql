-- The two uniqueness rules on items, applied by hand after the backfill.
--
-- They are not in schema.prisma when this ships, and that is deliberate. The build runs
-- `prisma db push` WITHOUT `--accept-data-loss`, and Prisma classes "add a unique
-- constraint" as a change that might fail against existing rows. Declaring them before the
-- data was known clean would have failed the deploy that first creates the Item table.
--
-- So the order is:
--
--   1. merge the branch          — db push adds the tables and the nullable columns
--   2. scripts/sql/001-backfill-items.sql  — every section gets an item, every entitlement an itemId
--                                (or node scripts/backfill-items.mjs, same thing)
--   3. this file                 — the rules, now that nothing can violate them
--   4. declare them in schema.prisma — db push then finds them already there and does nothing
--
-- Run it against the database directly:
--   psql "$DATABASE_URL_UNPOOLED" -f scripts/sql/002-item-unique-indexes.sql
-- or paste it into the Neon SQL editor.
--
-- It is safe to run twice: both statements are IF NOT EXISTS, and both will simply fail
-- rather than damage anything if the data is not clean — which is the check, not a risk.

-- One item per section. Nulls do not collide in Postgres, so any section the backfill has
-- not reached yet is ignored rather than blocking this.
create unique index if not exists "Section_itemId_key"
  on "Section" ("itemId");

-- One entitlement per member per item. This is what stops a second grant of the same
-- product creating a duplicate row instead of extending the one that is there.
create unique index if not exists "Entitlement_memberId_itemId_key"
  on "Entitlement" ("memberId", "itemId");
