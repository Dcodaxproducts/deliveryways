ALTER TABLE "menu_item_modifier_price_overrides"
  ADD COLUMN IF NOT EXISTS "is_required" BOOLEAN NOT NULL DEFAULT false;
