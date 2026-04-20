-- Menu Phase 3 foundation
-- Adds menu category linking, timed menu fields, and optional item deposit amount.

ALTER TABLE "menu_items"
  ADD COLUMN "deposit_amount" DECIMAL(10,2);

ALTER TABLE "restaurant_menus"
  ADD COLUMN "is_timed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "timing_config" JSONB;

CREATE TABLE "restaurant_menu_categories" (
  "id" TEXT NOT NULL,
  "restaurant_menu_id" TEXT NOT NULL,
  "menu_category_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "restaurant_menu_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "restaurant_menu_categories_restaurant_menu_id_menu_category_key"
  ON "restaurant_menu_categories"("restaurant_menu_id", "menu_category_id");

ALTER TABLE "restaurant_menu_categories"
  ADD CONSTRAINT "restaurant_menu_categories_restaurant_menu_id_fkey"
  FOREIGN KEY ("restaurant_menu_id") REFERENCES "restaurant_menus"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "restaurant_menu_categories"
  ADD CONSTRAINT "restaurant_menu_categories_menu_category_id_fkey"
  FOREIGN KEY ("menu_category_id") REFERENCES "menu_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
