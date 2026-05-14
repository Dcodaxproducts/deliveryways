ALTER TABLE "menu_items"
  ADD COLUMN "min_quantity" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "max_quantity" INTEGER;
