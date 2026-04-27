ALTER TABLE "menu_variation_modifier_price_overrides" ADD COLUMN "menu_item_id" TEXT;

ALTER TABLE "menu_variation_modifier_price_overrides"
  ADD CONSTRAINT "menu_variation_modifier_price_overrides_menu_item_id_fkey"
  FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_variation_modifier_price_overrides"
  DROP CONSTRAINT IF EXISTS "menu_variation_modifier_price_overrides_variationId_modifierId_key";
ALTER TABLE "menu_variation_modifier_price_overrides"
  DROP CONSTRAINT IF EXISTS "menu_variation_modifier_price_overrides_variation_id_modifier_id_key";

CREATE UNIQUE INDEX "menu_variation_modifier_price_overrides_menu_item_variation_modifier_key"
  ON "menu_variation_modifier_price_overrides"("menu_item_id", "variation_id", "modifier_id");
CREATE INDEX "menu_variation_modifier_price_overrides_variation_modifier_idx"
  ON "menu_variation_modifier_price_overrides"("variation_id", "modifier_id");
