ALTER TABLE "menu_items"
ADD COLUMN "ingredients" TEXT,
ADD COLUMN "nutritional_information" TEXT;

ALTER TABLE "menu_item_variations"
ADD COLUMN "description" TEXT;
