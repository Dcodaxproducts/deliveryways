-- Phase 1: additive payout lifecycle columns and states. No table rewrite is required.
ALTER TYPE "RestaurantWalletTransactionType" ADD VALUE IF NOT EXISTS 'PAYOUT_RELEASE';
ALTER TYPE "RestaurantPayoutRequestStatus" ADD VALUE IF NOT EXISTS 'RESERVED';
ALTER TYPE "RestaurantPayoutRequestStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "RestaurantPayoutRequestStatus" ADD VALUE IF NOT EXISTS 'PROVIDER_SUCCEEDED';
ALTER TYPE "RestaurantPayoutRequestStatus" ADD VALUE IF NOT EXISTS 'COMPLETED';
ALTER TYPE "RestaurantPayoutRequestStatus" ADD VALUE IF NOT EXISTS 'FAILED';
ALTER TYPE "RestaurantPayoutRequestStatus" ADD VALUE IF NOT EXISTS 'RELEASED';
ALTER TYPE "RestaurantPayoutRequestStatus" ADD VALUE IF NOT EXISTS 'NEEDS_RECONCILIATION';

ALTER TABLE "restaurant_payout_requests"
  ADD COLUMN IF NOT EXISTS "release_transaction_id" TEXT,
  ADD COLUMN IF NOT EXISTS "operation_key" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "request_hash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "provider" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "provider_idempotency_key" VARCHAR(191),
  ADD COLUMN IF NOT EXISTS "provider_reference" VARCHAR(191),
  ADD COLUMN IF NOT EXISTS "provider_status" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "provider_succeeded_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "claim_token" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "lease_expires_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "last_error" VARCHAR(1000),
  ADD COLUMN IF NOT EXISTS "released_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMPTZ;

DROP INDEX IF EXISTS "restaurant_wallet_transactions_payout_request_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_payout_requests_release_transaction_id_key"
  ON "restaurant_payout_requests"("release_transaction_id") WHERE "release_transaction_id" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_payout_requests_operation_key_key"
  ON "restaurant_payout_requests"("operation_key") WHERE "operation_key" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "restaurant_payout_requests_provider_idempotency_key_key"
  ON "restaurant_payout_requests"("provider_idempotency_key") WHERE "provider_idempotency_key" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "restaurant_wallet_transactions_payout_type_idx"
  ON "restaurant_wallet_transactions"("payout_request_id", "type");
CREATE INDEX IF NOT EXISTS "restaurant_payout_requests_recovery_idx"
  ON "restaurant_payout_requests"("status", "lease_expires_at", "created_at");
CREATE INDEX IF NOT EXISTS "restaurant_payout_requests_provider_ref_idx"
  ON "restaurant_payout_requests"("provider", "provider_reference");

-- Adopt only unambiguous historical payout debits. Ambiguous or mismatched rows remain null
-- and are reported by the companion backfill/runbook for manual quarantine.
UPDATE "restaurant_payout_requests" p
SET "operation_key" = encode(sha256(convert_to('feastflow:financial-ledger:v1:payout:legacy:' || p."id", 'UTF8')), 'hex'),
    "request_hash" = encode(sha256(convert_to(p."tenant_id" || '|' || p."restaurant_id" || '|' || p."amount"::text || '|' || upper(p."currency"), 'UTF8')), 'hex'),
    "provider_reference" = COALESCE(p."provider_reference", p."payment_reference"),
    "provider_succeeded_at" = CASE WHEN p."status" = 'PAID' THEN COALESCE(p."paid_at", p."updated_at") ELSE p."provider_succeeded_at" END
WHERE p."operation_key" IS NULL;

-- Rollback: drop the new indexes/columns after confirming no in-flight rows use the new
-- states. PostgreSQL enum values are intentionally retained during rollback; removing enum
-- labels requires a table/type rewrite and is not safe during an online rollback.
