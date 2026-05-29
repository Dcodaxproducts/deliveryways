-- Link menu items to multiple menu categories while keeping menu_items.category_id as the primary category for backward compatibility.
CREATE TABLE "menu_item_categories" (
  "id" TEXT NOT NULL,
  "menu_item_id" TEXT NOT NULL,
  "menu_category_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "menu_item_categories_pkey" PRIMARY KEY ("id")
);

INSERT INTO "menu_item_categories" ("id", "menu_item_id", "menu_category_id", "sort_order", "created_at", "updated_at")
SELECT concat('cmic_', replace(gen_random_uuid()::text, '-', '')), "id", "category_id", 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "menu_items"
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX "menu_item_categories_menu_item_id_menu_category_id_key"
  ON "menu_item_categories"("menu_item_id", "menu_category_id");
CREATE INDEX "menu_item_categories_menu_category_id_idx"
  ON "menu_item_categories"("menu_category_id");

ALTER TABLE "menu_item_categories"
  ADD CONSTRAINT "menu_item_categories_menu_item_id_fkey"
  FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_item_categories"
  ADD CONSTRAINT "menu_item_categories_menu_category_id_fkey"
  FOREIGN KEY ("menu_category_id") REFERENCES "menu_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
