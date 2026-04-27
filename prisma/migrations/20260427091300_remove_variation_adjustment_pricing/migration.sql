ALTER TABLE "menu_item_variations" DROP COLUMN IF EXISTS "pricing_mode";
ALTER TABLE "menu_item_variations" DROP COLUMN IF EXISTS "adjustment_value";
ALTER TABLE "menu_item_variation_price_overrides" DROP COLUMN IF EXISTS "pricing_mode";
ALTER TABLE "menu_item_variation_price_overrides" DROP COLUMN IF EXISTS "adjustment_value";
DROP TYPE IF EXISTS "VariationPricingMode";
