-- Centralize variation definitions and link them to categories.
ALTER TABLE "menu_item_variations" ADD COLUMN IF NOT EXISTS "restaurant_id" TEXT;

UPDATE "menu_item_variations" v
SET "restaurant_id" = c."restaurant_id"
FROM "menu_categories" c
WHERE v."category_id" = c."id" AND v."restaurant_id" IS NULL;

ALTER TABLE "menu_item_variations" ALTER COLUMN "restaurant_id" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "menu_category_variations" (
  "id" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "variation_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "menu_category_variations_pkey" PRIMARY KEY ("id")
);

INSERT INTO "menu_category_variations" ("id", "category_id", "variation_id", "sort_order", "is_default", "is_active", "created_at", "updated_at")
SELECT concat('mcv_', substr(md5(v."category_id" || ':' || v."id"), 1, 20)), v."category_id", v."id", v."sort_order", v."is_default", v."is_active", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "menu_item_variations" v
WHERE v."category_id" IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS "menu_category_variations_category_id_variation_id_key" ON "menu_category_variations"("category_id", "variation_id");
CREATE INDEX IF NOT EXISTS "menu_category_variations_variation_id_idx" ON "menu_category_variations"("variation_id");
CREATE INDEX IF NOT EXISTS "menu_item_variations_category_id_idx" ON "menu_item_variations"("category_id");

ALTER TABLE "menu_item_variations" ADD CONSTRAINT "menu_item_variations_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "menu_category_variations" ADD CONSTRAINT "menu_category_variations_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_category_variations" ADD CONSTRAINT "menu_category_variations_variation_id_fkey" FOREIGN KEY ("variation_id") REFERENCES "menu_item_variations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Keep old category_id for backward compatibility, but enforce central uniqueness going forward.
DROP INDEX IF EXISTS "menu_item_variations_category_id_name_key";
CREATE INDEX IF NOT EXISTS "menu_item_variations_restaurant_id_name_idx" ON "menu_item_variations"("restaurant_id", "name");
