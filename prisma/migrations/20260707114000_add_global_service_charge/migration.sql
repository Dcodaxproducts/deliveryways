-- Add platform-managed service charge settings to global settings.
ALTER TABLE "global_settings"
  ADD COLUMN "service_charge_enabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "service_charge_type" "ServiceChargeType" NOT NULL DEFAULT 'PERCENTAGE',
  ADD COLUMN "service_charge_value" DECIMAL(10,2) NOT NULL DEFAULT 0;
