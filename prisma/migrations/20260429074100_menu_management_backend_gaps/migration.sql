ALTER TABLE "menu_items"
  ADD COLUMN "allergen_pdf_url" TEXT,
  ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "menu_item_variation_price_overrides"
  ADD COLUMN "pickup_price" DECIMAL(10,2),
  ADD COLUMN "display_text" TEXT;

CREATE INDEX "menu_items_restaurant_id_sort_order_idx" ON "menu_items"("restaurant_id", "sort_order");
CREATE INDEX "menu_items_category_id_sort_order_idx" ON "menu_items"("category_id", "sort_order");
