-- Durable restaurant-local payout accounting and idempotent invoice delivery.
-- New tables and indexes are additive. Apply only after a verified backup.
BEGIN;

CREATE UNIQUE INDEX "generated_invoices_kind_source_key_key"
  ON "generated_invoices"("kind", "source_key");

CREATE TABLE "restaurant_payout_monthly_ledgers" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
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
  CONSTRAINT "restaurant_payout_monthly_ledgers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "restaurant_payout_monthly_ledgers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "restaurant_payout_monthly_ledgers_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "restaurant_payout_monthly_ledgers_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "tenant_subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "restaurant_payout_monthly_ledgers_package_plan_id_fkey" FOREIGN KEY ("package_plan_id") REFERENCES "package_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "restaurant_payout_monthly_ledgers_local_month_check" CHECK ("local_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "restaurant_payout_monthly_ledgers_money_check" CHECK (
    "commission_fixed_amount" >= 0 AND
    ("commission_cap_amount" IS NULL OR "commission_cap_amount" >= 0) AND
    "commission_allocated_amount" >= 0 AND
    ("commission_cap_amount" IS NULL OR "commission_allocated_amount" <= "commission_cap_amount") AND
    "monthly_fee_amount" >= 0 AND
    "monthly_fee_allocated_amount" >= 0 AND
    "monthly_fee_allocated_amount" <= "monthly_fee_amount" AND
    "monthly_fee_outstanding_amount" >= 0 AND
    "monthly_fee_outstanding_amount" <= "monthly_fee_amount"
  ),
  CONSTRAINT "restaurant_payout_monthly_ledgers_percent_check" CHECK (
    "commission_percentage" >= 0 AND "commission_percentage" <= 100 AND
    "vat_percentage" >= 0 AND "vat_percentage" <= 100
  )
);
CREATE UNIQUE INDEX "restaurant_payout_monthly_ledgers_scope_key" ON "restaurant_payout_monthly_ledgers"("restaurant_id", "subscription_id", "local_month");
CREATE INDEX "restaurant_payout_monthly_ledgers_tenant_idx" ON "restaurant_payout_monthly_ledgers"("tenant_id", "restaurant_id", "local_month");
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
  CONSTRAINT "restaurant_payout_allocations_generated_invoice_id_fkey" FOREIGN KEY ("generated_invoice_id") REFERENCES "generated_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "restaurant_payout_allocations_sequence_check" CHECK ("sequence" > 0),
  CONSTRAINT "restaurant_payout_allocations_money_check" CHECK (
    "commission_amount" >= 0 AND "monthly_fee_amount" >= 0 AND "available_payout_amount" >= 0
  )
);
CREATE UNIQUE INDEX "restaurant_payout_allocations_source_key_key" ON "restaurant_payout_allocations"("source_key");
CREATE UNIQUE INDEX "restaurant_payout_allocations_sequence_key" ON "restaurant_payout_allocations"("ledger_id", "sequence");
CREATE INDEX "restaurant_payout_allocations_ledger_idx" ON "restaurant_payout_allocations"("ledger_id", "finalized_at");
CREATE INDEX "restaurant_payout_allocations_invoice_idx" ON "restaurant_payout_allocations"("generated_invoice_id");

CREATE TABLE "restaurant_payout_schedules" (
  "restaurant_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "last_finalized_at" TIMESTAMPTZ,
  "lock_token" VARCHAR(64),
  "lock_expires_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "restaurant_payout_schedules_pkey" PRIMARY KEY ("restaurant_id"),
  CONSTRAINT "restaurant_payout_schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "restaurant_payout_schedules_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "restaurant_payout_schedules_lock_token_key" ON "restaurant_payout_schedules"("lock_token");
CREATE INDEX "restaurant_payout_schedules_tenant_idx" ON "restaurant_payout_schedules"("tenant_id", "restaurant_id");

CREATE TABLE "payout_invoice_email_outbox" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "generated_invoice_id" TEXT NOT NULL,
  "recipient_email" VARCHAR(320) NOT NULL,
  "actor_id" TEXT,
  "claimed_at" TIMESTAMPTZ,
  "sent_at" TIMESTAMPTZ,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" VARCHAR(1000),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "payout_invoice_email_outbox_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payout_invoice_email_outbox_invoice_id_fkey" FOREIGN KEY ("generated_invoice_id") REFERENCES "generated_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payout_invoice_email_outbox_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payout_invoice_email_outbox_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "payout_invoice_email_outbox_attempts_check" CHECK ("attempts" >= 0)
);
CREATE UNIQUE INDEX "payout_invoice_email_outbox_generated_invoice_id_key" ON "payout_invoice_email_outbox"("generated_invoice_id");
CREATE INDEX "payout_invoice_email_outbox_dispatch_idx" ON "payout_invoice_email_outbox"("sent_at", "claimed_at", "created_at");
CREATE INDEX "payout_invoice_email_outbox_tenant_idx" ON "payout_invoice_email_outbox"("tenant_id", "restaurant_id");

COMMIT;
