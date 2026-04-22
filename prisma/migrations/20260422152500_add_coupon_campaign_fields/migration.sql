DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'CouponCampaignKind'
  ) THEN
    CREATE TYPE "CouponCampaignKind" AS ENUM ('PROMOTION', 'HAPPY_HOUR');
  END IF;
END $$;

ALTER TABLE "coupons"
  ADD COLUMN IF NOT EXISTS "kind" "CouponCampaignKind" NOT NULL DEFAULT 'PROMOTION',
  ADD COLUMN IF NOT EXISTS "active_days" JSONB,
  ADD COLUMN IF NOT EXISTS "daily_start_time" TEXT,
  ADD COLUMN IF NOT EXISTS "daily_end_time" TEXT;
