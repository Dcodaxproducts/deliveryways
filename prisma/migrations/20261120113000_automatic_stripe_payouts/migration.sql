BEGIN;

CREATE TYPE "AutomaticPayoutTransferState" AS ENUM (
  'PENDING', 'PREPARING', 'SENDING', 'SUCCEEDED',
  'RETRY_WAIT', 'BLOCKED', 'UNKNOWN', 'FAILED'
);

ALTER TABLE "restaurant_wallet_accounts"
  ADD COLUMN "reserved_payout_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD CONSTRAINT "restaurant_wallet_reserved_payout_balance_check"
    CHECK ("reserved_payout_balance" >= 0 AND "reserved_payout_balance" <= "balance");

CREATE TABLE "automatic_payout_transfers" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "generated_invoice_id" TEXT,
  "payout_request_id" TEXT,
  "provider" VARCHAR(24),
  "state" "AutomaticPayoutTransferState" NOT NULL DEFAULT 'PENDING',
  "amount" DECIMAL(12,2) NOT NULL,
  "currency" VARCHAR(10) NOT NULL,
  "idempotency_key" VARCHAR(255) NOT NULL,
  "requested_by" TEXT,
  "description" VARCHAR(500),
  "provider_reference" VARCHAR(255),
  "claim_token" VARCHAR(64),
  "claim_expires_at" TIMESTAMPTZ,
  "next_attempt_at" TIMESTAMPTZ,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" VARCHAR(1000),
  "provider_submitted_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "reconciled_at" TIMESTAMPTZ,
  "reconciled_by" TEXT,
  "reconciliation_note" VARCHAR(1000),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "automatic_payout_transfers_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "automatic_payout_transfers_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "automatic_payout_transfers_attempts_check" CHECK ("attempts" >= 0 AND "attempts" <= 8),
  CONSTRAINT "automatic_payout_transfers_invoice_fkey" FOREIGN KEY ("generated_invoice_id") REFERENCES "generated_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "automatic_payout_transfers_payout_request_fkey" FOREIGN KEY ("payout_request_id") REFERENCES "restaurant_payout_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "automatic_payout_transfers_tenant_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "automatic_payout_transfers_restaurant_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "automatic_payout_transfers_generated_invoice_id_key" ON "automatic_payout_transfers"("generated_invoice_id");
CREATE UNIQUE INDEX "automatic_payout_transfers_payout_request_id_key" ON "automatic_payout_transfers"("payout_request_id");
CREATE UNIQUE INDEX "automatic_payout_transfers_idempotency_key_key" ON "automatic_payout_transfers"("idempotency_key");
CREATE UNIQUE INDEX "automatic_payout_transfers_claim_token_key" ON "automatic_payout_transfers"("claim_token");
CREATE UNIQUE INDEX "automatic_payout_transfers_provider_reference_key" ON "automatic_payout_transfers"("provider", "provider_reference");
CREATE INDEX "automatic_payout_transfers_dispatch_idx" ON "automatic_payout_transfers"("state", "next_attempt_at", "claim_expires_at", "created_at");
CREATE INDEX "automatic_payout_transfers_restaurant_idx" ON "automatic_payout_transfers"("restaurant_id", "created_at");
CREATE UNIQUE INDEX "automatic_payout_transfers_restaurant_active_key"
  ON "automatic_payout_transfers"("restaurant_id")
  WHERE "state" IN ('PREPARING', 'SENDING', 'UNKNOWN');

COMMIT;
