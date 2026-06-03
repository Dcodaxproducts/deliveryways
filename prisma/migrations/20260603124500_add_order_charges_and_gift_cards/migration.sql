-- Add gift cards to promotion campaigns.
ALTER TYPE "CouponCampaignKind" ADD VALUE IF NOT EXISTS 'GIFT_CARD';

-- Add branch/order service charge support.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ServiceChargeType') THEN
    CREATE TYPE "ServiceChargeType" AS ENUM ('PERCENTAGE', 'AMOUNT');
  END IF;
END $$;

ALTER TABLE "carts"
  ADD COLUMN IF NOT EXISTS "tip_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "service_charge_type" "ServiceChargeType",
  ADD COLUMN IF NOT EXISTS "service_charge_value" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "service_charge_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "tip_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
