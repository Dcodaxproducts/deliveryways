ALTER TABLE "menu_item_variations"
  ADD COLUMN IF NOT EXISTS "category_id" TEXT;

UPDATE "menu_item_variations" mv
SET "category_id" = mi."category_id"
FROM "menu_items" mi
WHERE mv."menu_item_id" = mi."id"
  AND mv."category_id" IS NULL;

ALTER TABLE "menu_item_variations"
  ALTER COLUMN "category_id" SET NOT NULL;

ALTER TABLE "menu_item_variations"
  DROP CONSTRAINT IF EXISTS "menu_item_variations_required_modifier_id_fkey";

ALTER TABLE "menu_item_variations"
  DROP CONSTRAINT IF EXISTS "menu_item_variations_menu_item_id_fkey";

DROP INDEX IF EXISTS "menu_item_variations_menu_item_id_name_key";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'menu_item_variations_category_id_fkey'
  ) THEN
    ALTER TABLE "menu_item_variations"
      ADD CONSTRAINT "menu_item_variations_category_id_fkey"
      FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

WITH ranked_variations AS (
  SELECT
    mv."id",
    mv."name",
    mi."name" AS "menu_item_name",
    ROW_NUMBER() OVER (
      PARTITION BY mv."category_id", mv."name"
      ORDER BY mv."created_at" ASC, mv."id" ASC
    ) AS "duplicate_rank"
  FROM "menu_item_variations" mv
  LEFT JOIN "menu_items" mi ON mi."id" = mv."menu_item_id"
)
UPDATE "menu_item_variations" mv
SET "name" = CONCAT(
  ranked_variations."name",
  ' (',
  COALESCE(NULLIF(ranked_variations."menu_item_name", ''), 'Item'),
  ' ',
  ranked_variations."duplicate_rank",
  ')'
)
FROM ranked_variations
WHERE mv."id" = ranked_variations."id"
  AND ranked_variations."duplicate_rank" > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "menu_item_variations_category_id_name_key"
  ON "menu_item_variations"("category_id", "name");

ALTER TABLE "menu_item_variations"
  DROP COLUMN IF EXISTS "required_modifier_id",
  DROP COLUMN IF EXISTS "menu_item_id";
