-- Where each product opens.
--
-- Run once, after the Item.url column exists (the deploy adds it). Idempotent: it only
-- fills a URL that is not already set, so running it twice changes nothing and it never
-- overwrites one edited since.
--
-- Neon SQL Editor, or psql against DATABASE_URL_UNPOOLED.

UPDATE "Item"
   SET "url" = 'https://nexus-funds.vercel.app'
 WHERE "slug" = 'nexus-ramp'
   AND "url" IS NULL;

-- What it looks like afterwards.
SELECT "slug", "name", "url" FROM "Item" WHERE "kind" = 'product' ORDER BY "slug";
