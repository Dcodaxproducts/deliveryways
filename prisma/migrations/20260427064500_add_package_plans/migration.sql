CREATE TYPE "PackageBillingModel" AS ENUM ('COMMISSION', 'PLAN', 'HYBRID');
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

CREATE TABLE "package_plans" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "billing_model" "PackageBillingModel" NOT NULL,
    "billing_interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY',
    "plan_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "commission_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'PKR',
    "trial_days" INTEGER NOT NULL DEFAULT 0,
    "features" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "package_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenant_subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "restaurant_id" TEXT,
    "package_plan_id" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMPTZ,
    "note" TEXT,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "package_plans_tenant_id_billing_model_is_active_idx" ON "package_plans"("tenant_id", "billing_model", "is_active");
CREATE INDEX "package_plans_is_default_is_active_idx" ON "package_plans"("is_default", "is_active");
CREATE INDEX "tenant_subscriptions_tenant_id_status_idx" ON "tenant_subscriptions"("tenant_id", "status");
CREATE INDEX "tenant_subscriptions_restaurant_id_status_idx" ON "tenant_subscriptions"("restaurant_id", "status");
CREATE INDEX "tenant_subscriptions_package_plan_id_status_idx" ON "tenant_subscriptions"("package_plan_id", "status");

ALTER TABLE "package_plans" ADD CONSTRAINT "package_plans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tenant_subscriptions" ADD CONSTRAINT "tenant_subscriptions_package_plan_id_fkey" FOREIGN KEY ("package_plan_id") REFERENCES "package_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
