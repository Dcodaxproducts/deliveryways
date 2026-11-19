-- Durable, restaurant-local monthly payout accounting. Apply during a maintenance window
-- after backing up the database; this migration is intentionally not applied here.
CREATE TABLE "restaurant_payout_monthly_ledgers" (
  "id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "subscription_id" TEXT NOT NULL,
  "local_month" VARCHAR(7) NOT NULL,
  "timezone" VARCHAR(100) NOT NULL,
  "currency" VARCHAR(10) NOT NULL,
  "package_plan_id" TEXT NOT NULL,
  "billing_model" "PackageBillingModel" NOT NULL,
  "commission_type" "PackageCommissionType" NOT NULL,
  "commission_percentage" DECIMAL(5,2) NOT NULL,
  "commission_fixed_amount" DECIMAL(10,2) NOT NULL,
  "commission_cap_amount" DECIMAL(10,2),
  "vat_percentage" DECIMAL(5,2) NOT NULL,
  "commission_allocated_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "monthly_fee_amount" DECIMAL(10,2) NOT NULL,
  "monthly_fee_allocated_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "monthly_fee_outstanding_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "finalized_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "restaurant_payout_monthly_ledgers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "restaurant_payout_monthly_ledgers_scope_key" ON "restaurant_payout_monthly_ledgers"("restaurant_id", "subscription_id", "local_month");
CREATE INDEX "restaurant_payout_monthly_ledgers_lookup_idx" ON "restaurant_payout_monthly_ledgers"("restaurant_id", "local_month");
CREATE INDEX "restaurant_payout_monthly_ledgers_finalize_idx" ON "restaurant_payout_monthly_ledgers"("finalized_at", "local_month");

CREATE TABLE "restaurant_payout_allocations" (
  "id" TEXT NOT NULL,
  "ledger_id" TEXT NOT NULL,
  "generated_invoice_id" TEXT,
  "source_key" VARCHAR(255) NOT NULL,
  "sequence" INTEGER NOT NULL,
  "commission_amount" DECIMAL(10,2) NOT NULL,
  "monthly_fee_amount" DECIMAL(10,2) NOT NULL,
  "available_payout_amount" DECIMAL(12,2) NOT NULL,
  "is_special_payout" BOOLEAN NOT NULL DEFAULT false,
  "snapshot_hash" VARCHAR(64) NOT NULL,
  "finalized_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_payout_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "restaurant_payout_allocations_ledger_id_fkey" FOREIGN KEY ("ledger_id") REFERENCES "restaurant_payout_monthly_ledgers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "restaurant_payout_allocations_generated_invoice_id_fkey" FOREIGN KEY ("generated_invoice_id") REFERENCES "generated_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "restaurant_payout_allocations_source_key_key" ON "restaurant_payout_allocations"("source_key");
CREATE UNIQUE INDEX "restaurant_payout_allocations_sequence_key" ON "restaurant_payout_allocations"("ledger_id", "sequence");
CREATE INDEX "restaurant_payout_allocations_ledger_idx" ON "restaurant_payout_allocations"("ledger_id", "finalized_at");
CREATE INDEX "restaurant_payout_allocations_invoice_idx" ON "restaurant_payout_allocations"("generated_invoice_id");

CREATE TABLE "restaurant_payout_schedules" (
  "restaurant_id" TEXT NOT NULL,
  "last_finalized_at" TIMESTAMPTZ,
  "lock_token" VARCHAR(64),
  "lock_expires_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "restaurant_payout_schedules_pkey" PRIMARY KEY ("restaurant_id")
);
CREATE UNIQUE INDEX "restaurant_payout_schedules_lock_token_key" ON "restaurant_payout_schedules"("lock_token");
