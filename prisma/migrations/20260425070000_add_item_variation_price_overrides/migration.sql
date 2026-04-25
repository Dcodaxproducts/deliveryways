CREATE TABLE IF NOT EXISTS "menu_item_variation_price_overrides" (
  "id" TEXT NOT NULL,
  "menu_item_id" TEXT NOT NULL,
  "variation_id" TEXT NOT NULL,
  "pricing_mode" "VariationPricingMode" NOT NULL DEFAULT 'FIXED',
  "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "adjustment_value" DECIMAL(10,2),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "menu_item_variation_price_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "menu_item_variation_price_overrides_menu_item_id_variation_id_key"
  ON "menu_item_variation_price_overrides"("menu_item_id", "variation_id");

CREATE INDEX IF NOT EXISTS "menu_item_variation_price_overrides_variation_id_idx"
  ON "menu_item_variation_price_overrides"("variation_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'menu_item_variation_price_overrides_menu_item_id_fkey'
  ) THEN
    ALTER TABLE "menu_item_variation_price_overrides"
      ADD CONSTRAINT "menu_item_variation_price_overrides_menu_item_id_fkey"
      FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'menu_item_variation_price_overrides_variation_id_fkey'
  ) THEN
    ALTER TABLE "menu_item_variation_price_overrides"
      ADD CONSTRAINT "menu_item_variation_price_overrides_variation_id_fkey"
      FOREIGN KEY ("variation_id") REFERENCES "menu_item_variations"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;

INSERT INTO "menu_item_variation_price_overrides" (
  "id",
  "menu_item_id",
  "variation_id",
  "pricing_mode",
  "price",
  "adjustment_value",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid()::text,
  mi."id",
  v."id",
  v."pricing_mode",
  v."price",
  v."adjustment_value",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "menu_items" AS mi
INNER JOIN "menu_item_variations" AS v
  ON v."category_id" = mi."category_id"
WHERE mi."deleted_at" IS NULL
  AND v."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "menu_item_variation_price_overrides" AS existing
    WHERE existing."menu_item_id" = mi."id"
      AND existing."variation_id" = v."id"
  );
