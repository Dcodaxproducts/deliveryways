ALTER TABLE "menu_item_variations"
ADD COLUMN "required_modifier_id" TEXT;

ALTER TABLE "menu_item_variations"
ADD CONSTRAINT "menu_item_variations_required_modifier_id_fkey"
FOREIGN KEY ("required_modifier_id") REFERENCES "modifiers"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "menu_category_modifier_groups" (
  "id" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "modifier_group_id" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "menu_category_modifier_groups_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "menu_category_modifier_groups_category_id_modifier_group_id_key"
ON "menu_category_modifier_groups"("category_id", "modifier_group_id");

ALTER TABLE "menu_category_modifier_groups"
ADD CONSTRAINT "menu_category_modifier_groups_category_id_fkey"
FOREIGN KEY ("category_id") REFERENCES "menu_categories"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_category_modifier_groups"
ADD CONSTRAINT "menu_category_modifier_groups_modifier_group_id_fkey"
FOREIGN KEY ("modifier_group_id") REFERENCES "modifier_groups"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "menu_item_modifier_price_overrides" (
  "id" TEXT NOT NULL,
  "menu_item_id" TEXT NOT NULL,
  "modifier_id" TEXT NOT NULL,
  "price_delta" DECIMAL(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT "menu_item_modifier_price_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "menu_item_modifier_price_overrides_menu_item_id_modifier_id_key"
ON "menu_item_modifier_price_overrides"("menu_item_id", "modifier_id");

ALTER TABLE "menu_item_modifier_price_overrides"
ADD CONSTRAINT "menu_item_modifier_price_overrides_menu_item_id_fkey"
FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_item_modifier_price_overrides"
ADD CONSTRAINT "menu_item_modifier_price_overrides_modifier_id_fkey"
FOREIGN KEY ("modifier_id") REFERENCES "modifiers"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
