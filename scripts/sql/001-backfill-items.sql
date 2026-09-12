-- Give every existing section an Item, and every existing entitlement an itemId.
--
-- The same work as scripts/backfill-items.mjs, written as plain SQL so it can be pasted
-- into the Neon SQL editor without a checkout, Node, or a connection string on anyone's
-- machine. Run whichever suits you; running both changes nothing, because both are
-- idempotent.
--
-- Run this FIRST, then scripts/sql/002-item-unique-indexes.sql. That order matters: the
-- indexes in 002 are the rules, and rules go on after the data they describe is in place.
--
-- **Safe to run twice.** Every statement is guarded by a NOT EXISTS or a WHERE that
-- excludes rows already done, so a second run reports zero rows and changes nothing. That
-- is the check: run it, run it again, see zeroes.
--
-- It never deletes and never overwrites. The only rows created are items; the only columns
-- written are ones that were null.
--
-- One cosmetic note: ids here are uuids rather than the cuids Prisma generates, because
-- cuid is an application-side format with no SQL equivalent. Nothing reads the shape of an
-- id, so the two sit side by side happily.

begin;

-- ---------------------------------------------------------------------------
-- 1. One item per section.
--    Slug is prefixed so a section and a product can never collide on one handle.
-- ---------------------------------------------------------------------------
insert into "Item" (id, kind, slug, name, "createdAt", "updatedAt")
select
  gen_random_uuid()::text,
  'section',
  'section-' || s.slug,
  coalesce(s."displayName", s.slug),
  now(),
  now()
from "Section" s
where s."itemId" is null
  and not exists (select 1 from "Item" i where i.slug = 'section-' || s.slug);

-- ---------------------------------------------------------------------------
-- 2. Point each section at its item.
-- ---------------------------------------------------------------------------
update "Section" s
set "itemId" = i.id
from "Item" i
where s."itemId" is null
  and i.slug = 'section-' || s.slug;

-- ---------------------------------------------------------------------------
-- 3. The products.
--    Listed here rather than typed in by hand so every environment ends up with the same
--    handles the code checks against. A new product is a row added to this list until the
--    admin's own Products page exists.
-- ---------------------------------------------------------------------------
insert into "Item" (id, kind, slug, name, "createdAt", "updatedAt")
select gen_random_uuid()::text, 'product', v.slug, v.name, now(), now()
from (values ('nexus-ramp', 'Nexus RAMP')) as v(slug, name)
where not exists (select 1 from "Item" i where i.slug = v.slug);

-- ---------------------------------------------------------------------------
-- 4. Every entitlement points at its section's item.
-- ---------------------------------------------------------------------------
update "Entitlement" e
set "itemId" = s."itemId"
from "Section" s
where e."itemId" is null
  and e."sectionId" = s.id
  and s."itemId" is not null;

commit;

-- ---------------------------------------------------------------------------
-- What happened. Every number in the second column should be zero.
-- ---------------------------------------------------------------------------
select 'items'                        as what, count(*) as total from "Item"
union all
select 'sections without an item',     count(*) from "Section"     where "itemId" is null
union all
select 'entitlements without an item', count(*) from "Entitlement" where "itemId" is null;
