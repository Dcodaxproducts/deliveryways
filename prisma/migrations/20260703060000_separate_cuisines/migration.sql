ALTER TYPE "LocalizationEntityType" ADD VALUE IF NOT EXISTS 'CUISINE';

CREATE TABLE "cuisines" (
  "id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "image_url" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "cuisines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "menu_item_cuisines" (
  "id" TEXT NOT NULL,
  "menu_item_id" TEXT NOT NULL,
  "cuisine_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "menu_item_cuisines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cuisines_restaurant_id_slug_key" ON "cuisines"("restaurant_id", "slug");
CREATE INDEX "cuisines_restaurant_id_is_active_sort_order_idx" ON "cuisines"("restaurant_id", "is_active", "sort_order");
CREATE UNIQUE INDEX "menu_item_cuisines_menu_item_id_cuisine_id_key" ON "menu_item_cuisines"("menu_item_id", "cuisine_id");
CREATE INDEX "menu_item_cuisines_cuisine_id_idx" ON "menu_item_cuisines"("cuisine_id");

ALTER TABLE "cuisines"
ADD CONSTRAINT "cuisines_restaurant_id_fkey"
FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "menu_item_cuisines"
ADD CONSTRAINT "menu_item_cuisines_menu_item_id_fkey"
FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_item_cuisines"
ADD CONSTRAINT "menu_item_cuisines_cuisine_id_fkey"
FOREIGN KEY ("cuisine_id") REFERENCES "cuisines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill cuisines from the records previously exposed publicly as cuisines.
INSERT INTO "cuisines" (
  "id",
  "restaurant_id",
  "name",
  "slug",
  "description",
  "image_url",
  "sort_order",
  "is_active",
  "deleted_at",
  "created_at",
  "updated_at"
)
SELECT
  'cuisine_' || md5("id") AS "id",
  "restaurant_id",
  "name",
  "slug",
  "description",
  "image_url",
  "sort_order",
  "is_active",
  "deleted_at",
  "created_at",
  "updated_at"
FROM "menu_categories"
ON CONFLICT ("restaurant_id", "slug") DO NOTHING;

INSERT INTO "menu_item_cuisines" (
  "id",
  "menu_item_id",
  "cuisine_id",
  "sort_order",
  "created_at",
  "updated_at"
)
SELECT
  'mic_' || md5(mi."id" || ':' || c."id") AS "id",
  mi."id" AS "menu_item_id",
  c."id" AS "cuisine_id",
  0 AS "sort_order",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "menu_items" mi
JOIN "menu_categories" mc ON mc."id" = mi."category_id"
JOIN "cuisines" c ON c."restaurant_id" = mc."restaurant_id" AND c."slug" = mc."slug"
ON CONFLICT ("menu_item_id", "cuisine_id") DO NOTHING;

INSERT INTO "menu_item_cuisines" (
  "id",
  "menu_item_id",
  "cuisine_id",
  "sort_order",
  "created_at",
  "updated_at"
)
SELECT
  'mic_' || md5(mic."menu_item_id" || ':' || c."id") AS "id",
  mic."menu_item_id",
  c."id" AS "cuisine_id",
  mic."sort_order",
  mic."created_at",
  mic."updated_at"
FROM "menu_item_categories" mic
JOIN "menu_categories" mc ON mc."id" = mic."menu_category_id"
JOIN "cuisines" c ON c."restaurant_id" = mc."restaurant_id" AND c."slug" = mc."slug"
ON CONFLICT ("menu_item_id", "cuisine_id") DO NOTHING;
