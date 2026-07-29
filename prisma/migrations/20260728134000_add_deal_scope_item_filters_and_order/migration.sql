ALTER TABLE "coupons"
ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "coupon_scope_categories"
ADD COLUMN "included_menu_item_ids" JSONB,
ADD COLUMN "excluded_menu_item_ids" JSONB;

CREATE INDEX "coupons_restaurant_id_kind_sort_order_idx"
ON "coupons"("restaurant_id", "kind", "sort_order");
