-- Add restaurant-specific subscription charges/credits and payout-cycle overrides.

CREATE TYPE "SubscriptionAdjustmentDirection" AS ENUM ('CHARGE', 'CREDIT');
CREATE TYPE "SubscriptionAdjustmentSource" AS ENUM ('CUSTOM', 'MODULE');

ALTER TABLE "tenant_subscriptions"
  ADD COLUMN "payout_cycle_override" "PackagePayoutCycle";

ALTER TABLE "subscription_deductions"
  ADD COLUMN "direction" "SubscriptionAdjustmentDirection" NOT NULL DEFAULT 'CREDIT',
  ADD COLUMN "source" "SubscriptionAdjustmentSource" NOT NULL DEFAULT 'CUSTOM',
  ADD COLUMN "module_code" VARCHAR(80);

CREATE INDEX "subscription_deductions_restaurant_id_module_code_status_idx"
  ON "subscription_deductions"("restaurant_id", "module_code", "status");
