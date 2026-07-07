CREATE TYPE "SubscriptionDeductionType" AS ENUM ('ONE_TIME', 'RECURRING');
CREATE TYPE "SubscriptionDeductionStatus" AS ENUM ('ACTIVE', 'APPLIED', 'CANCELLED');

CREATE TABLE "subscription_deductions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "restaurant_id" TEXT,
  "subscription_id" TEXT,
  "type" "SubscriptionDeductionType" NOT NULL DEFAULT 'ONE_TIME',
  "status" "SubscriptionDeductionStatus" NOT NULL DEFAULT 'ACTIVE',
  "title" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'PKR',
  "applies_from" TIMESTAMPTZ,
  "applied_at" TIMESTAMPTZ,
  "created_by" TEXT,
  "updated_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "subscription_deductions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subscription_deductions_tenant_id_status_idx" ON "subscription_deductions"("tenant_id", "status");
CREATE INDEX "subscription_deductions_restaurant_id_status_idx" ON "subscription_deductions"("restaurant_id", "status");
CREATE INDEX "subscription_deductions_subscription_id_status_idx" ON "subscription_deductions"("subscription_id", "status");

ALTER TABLE "subscription_deductions" ADD CONSTRAINT "subscription_deductions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_deductions" ADD CONSTRAINT "subscription_deductions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "subscription_deductions" ADD CONSTRAINT "subscription_deductions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "tenant_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
