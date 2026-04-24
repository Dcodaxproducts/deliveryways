CREATE TYPE "VariationPricingMode" AS ENUM ('FIXED', 'FLAT_ADJUSTMENT', 'PERCENTAGE_ADJUSTMENT');

ALTER TABLE "menu_item_variations"
ADD COLUMN "pricing_mode" "VariationPricingMode" NOT NULL DEFAULT 'FIXED',
ADD COLUMN "adjustment_value" DECIMAL(10, 2);
