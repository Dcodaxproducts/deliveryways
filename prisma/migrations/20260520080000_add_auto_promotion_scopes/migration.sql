DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CouponApplyMode') THEN
    CREATE TYPE "CouponApplyMode" AS ENUM ('ORDER_TOTAL', 'SCOPED_ITEMS');
  END IF;
END $$;

ALTER TABLE "coupons"
  ADD COLUMN IF NOT EXISTS "apply_mode" "CouponApplyMode" NOT NULL DEFAULT 'ORDER_TOTAL',
  ADD COLUMN IF NOT EXISTS "auto_apply" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "coupon_scope_menu_items" (
  "id" TEXT PRIMARY KEY,
  "coupon_id" TEXT NOT NULL,
  "menu_item_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "coupon_scope_categories" (
  "id" TEXT PRIMARY KEY,
  "coupon_id" TEXT NOT NULL,
  "menu_category_id" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "coupon_scope_menu_items_coupon_id_menu_item_id_key"
  ON "coupon_scope_menu_items" ("coupon_id", "menu_item_id");
CREATE INDEX IF NOT EXISTS "coupon_scope_menu_items_menu_item_id_idx"
  ON "coupon_scope_menu_items" ("menu_item_id");

CREATE UNIQUE INDEX IF NOT EXISTS "coupon_scope_categories_coupon_id_menu_category_id_key"
  ON "coupon_scope_categories" ("coupon_id", "menu_category_id");
CREATE INDEX IF NOT EXISTS "coupon_scope_categories_menu_category_id_idx"
  ON "coupon_scope_categories" ("menu_category_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'coupon_scope_menu_items_coupon_id_fkey'
  ) THEN
    ALTER TABLE "coupon_scope_menu_items"
      ADD CONSTRAINT "coupon_scope_menu_items_coupon_id_fkey"
      FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'coupon_scope_menu_items_menu_item_id_fkey'
  ) THEN
    ALTER TABLE "coupon_scope_menu_items"
      ADD CONSTRAINT "coupon_scope_menu_items_menu_item_id_fkey"
      FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'coupon_scope_categories_coupon_id_fkey'
  ) THEN
    ALTER TABLE "coupon_scope_categories"
      ADD CONSTRAINT "coupon_scope_categories_coupon_id_fkey"
      FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'coupon_scope_categories_menu_category_id_fkey'
  ) THEN
    ALTER TABLE "coupon_scope_categories"
      ADD CONSTRAINT "coupon_scope_categories_menu_category_id_fkey"
      FOREIGN KEY ("menu_category_id") REFERENCES "menu_categories"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
