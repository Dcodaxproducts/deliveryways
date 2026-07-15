-- Allow shorter billing intervals selected by the superadmin UI.
ALTER TYPE "BillingInterval" ADD VALUE IF NOT EXISTS 'DAILY';
ALTER TYPE "BillingInterval" ADD VALUE IF NOT EXISTS 'WEEKLY';
ALTER TYPE "BillingInterval" ADD VALUE IF NOT EXISTS 'BIWEEKLY';

-- Soft-deleted menu categories should not reserve their slug forever.
DROP INDEX IF EXISTS "menu_categories_restaurant_id_slug_key";
CREATE UNIQUE INDEX "menu_categories_restaurant_id_slug_active_key"
  ON "menu_categories"("restaurant_id", "slug")
  WHERE "deleted_at" IS NULL;
