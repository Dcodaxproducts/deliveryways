CREATE TYPE "MenuItemPricingMode" AS ENUM ('SINGLE', 'MULTIPLE');

ALTER TABLE "menu_items"
  ADD COLUMN "pricing_mode" "MenuItemPricingMode" NOT NULL DEFAULT 'SINGLE',
  ADD COLUMN "delivery_price_adjustment" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "takeaway_price_adjustment" DECIMAL(10,2) NOT NULL DEFAULT 0;
