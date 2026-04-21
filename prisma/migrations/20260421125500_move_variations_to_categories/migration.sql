ALTER TABLE "menu_item_variations"
  ADD COLUMN "category_id" TEXT;

UPDATE "menu_item_variations" mv
SET "category_id" = mi."category_id"
FROM "menu_items" mi
WHERE mv."menu_item_id" = mi."id";

ALTER TABLE "menu_item_variations"
  ALTER COLUMN "category_id" SET NOT NULL;

ALTER TABLE "menu_item_variations"
  DROP CONSTRAINT IF EXISTS "menu_item_variations_required_modifier_id_fkey";

ALTER TABLE "menu_item_variations"
  DROP CONSTRAINT IF EXISTS "menu_item_variations_menu_item_id_fkey";

DROP INDEX IF EXISTS "menu_item_variations_menu_item_id_name_key";

ALTER TABLE "menu_item_variations"
  ADD CONSTRAINT "menu_item_variations_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "menu_item_variations_category_id_name_key"
  ON "menu_item_variations"("category_id", "name");

ALTER TABLE "menu_item_variations"
  DROP COLUMN "required_modifier_id",
  DROP COLUMN "menu_item_id";
