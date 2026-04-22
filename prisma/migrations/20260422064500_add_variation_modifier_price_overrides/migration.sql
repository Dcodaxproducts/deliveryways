CREATE TABLE IF NOT EXISTS "menu_variation_modifier_price_overrides" (
  "id" TEXT NOT NULL,
  "variation_id" TEXT NOT NULL,
  "modifier_id" TEXT NOT NULL,
  "price_delta" DECIMAL(10,2) NOT NULL DEFAULT 0,
  CONSTRAINT "menu_variation_modifier_price_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "menu_variation_modifier_price_overrides_variation_id_modifier_id_key"
  ON "menu_variation_modifier_price_overrides"("variation_id", "modifier_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'menu_variation_modifier_price_overrides_variation_id_fkey'
  ) THEN
    ALTER TABLE "menu_variation_modifier_price_overrides"
      ADD CONSTRAINT "menu_variation_modifier_price_overrides_variation_id_fkey"
      FOREIGN KEY ("variation_id") REFERENCES "menu_item_variations"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'menu_variation_modifier_price_overrides_modifier_id_fkey'
  ) THEN
    ALTER TABLE "menu_variation_modifier_price_overrides"
      ADD CONSTRAINT "menu_variation_modifier_price_overrides_modifier_id_fkey"
      FOREIGN KEY ("modifier_id") REFERENCES "modifiers"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
