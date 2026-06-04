-- Add flexible deal bundle rules for fixed-price promotions.
CREATE TYPE "CouponDealSelectionMode" AS ENUM ('FIXED_ITEMS', 'FLEXIBLE_ITEMS');

ALTER TABLE "coupons"
  ADD COLUMN "deal_selection_mode" "CouponDealSelectionMode",
  ADD COLUMN "deal_required_quantity" INTEGER;
