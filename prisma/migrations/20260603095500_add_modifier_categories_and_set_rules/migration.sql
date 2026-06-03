CREATE TYPE "ModifierSelectionType" AS ENUM ('SINGLE', 'MULTIPLE');

CREATE TABLE "modifier_categories" (
  "id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "modifier_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "modifier_categories_restaurant_id_slug_key"
  ON "modifier_categories"("restaurant_id", "slug");

CREATE INDEX "modifier_categories_restaurant_id_sort_order_idx"
  ON "modifier_categories"("restaurant_id", "sort_order");

ALTER TABLE "modifier_categories"
  ADD CONSTRAINT "modifier_categories_restaurant_id_fkey"
  FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "modifier_categories" (
  "id",
  "restaurant_id",
  "name",
  "slug",
  "created_at",
  "updated_at"
)
SELECT
  'modcat_' || md5("id"),
  "id",
  'Uncategorized',
  'uncategorized',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "restaurants"
ON CONFLICT ("restaurant_id", "slug") DO NOTHING;

ALTER TABLE "modifiers"
  ADD COLUMN "category_id" TEXT;

UPDATE "modifiers" modifier
SET "category_id" = category."id"
FROM "modifier_categories" category
WHERE category."restaurant_id" = modifier."restaurant_id"
  AND category."slug" = 'uncategorized'
  AND modifier."category_id" IS NULL;

ALTER TABLE "modifiers"
  ALTER COLUMN "category_id" SET NOT NULL;

CREATE INDEX "modifiers_category_id_idx"
  ON "modifiers"("category_id");

ALTER TABLE "modifiers"
  ADD CONSTRAINT "modifiers_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "modifier_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "menu_item_modifier_groups"
  ADD COLUMN "selection_type" "ModifierSelectionType" NOT NULL DEFAULT 'SINGLE',
  ADD COLUMN "min_select" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "max_select" INTEGER NOT NULL DEFAULT 1;

UPDATE "menu_item_modifier_groups" item_link
SET
  "selection_type" = CASE
    WHEN modifier_group."max_select" > 1 THEN 'MULTIPLE'::"ModifierSelectionType"
    ELSE 'SINGLE'::"ModifierSelectionType"
  END,
  "min_select" = CASE
    WHEN modifier_group."is_required" THEN GREATEST(modifier_group."min_select", 1)
    ELSE modifier_group."min_select"
  END,
  "max_select" = modifier_group."max_select"
FROM "modifier_groups" modifier_group
WHERE modifier_group."id" = item_link."modifier_group_id";

ALTER TABLE "menu_category_modifier_groups"
  ADD COLUMN "selection_type" "ModifierSelectionType" NOT NULL DEFAULT 'SINGLE',
  ADD COLUMN "min_select" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "max_select" INTEGER NOT NULL DEFAULT 1;

UPDATE "menu_category_modifier_groups" category_link
SET
  "selection_type" = CASE
    WHEN modifier_group."max_select" > 1 THEN 'MULTIPLE'::"ModifierSelectionType"
    ELSE 'SINGLE'::"ModifierSelectionType"
  END,
  "min_select" = CASE
    WHEN modifier_group."is_required" THEN GREATEST(modifier_group."min_select", 1)
    ELSE modifier_group."min_select"
  END,
  "max_select" = modifier_group."max_select"
FROM "modifier_groups" modifier_group
WHERE modifier_group."id" = category_link."modifier_group_id";
