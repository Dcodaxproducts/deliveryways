ALTER TABLE "coupon_scope_categories"
ADD COLUMN "item_limit" INTEGER,
ADD COLUMN "forced_variation_id" TEXT;

CREATE INDEX "coupon_scope_categories_forced_variation_id_idx"
ON "coupon_scope_categories"("forced_variation_id");

ALTER TABLE "coupon_scope_categories"
ADD CONSTRAINT "coupon_scope_categories_forced_variation_id_fkey"
FOREIGN KEY ("forced_variation_id") REFERENCES "menu_item_variations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
