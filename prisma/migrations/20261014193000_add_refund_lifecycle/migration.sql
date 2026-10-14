-- Additive durable lifecycle and fencing for provider refunds.
CREATE TYPE "RefundLifecycleStatus" AS ENUM (
  'RESERVED',
  'PROCESSING',
  'PROVIDER_SUCCEEDED',
  'NEEDS_RECONCILIATION',
  'FAILED_RELEASED',
  'COMPLETED',
  'LEGACY_QUARANTINED'
);

ALTER TYPE "RestaurantWalletTransactionType" ADD VALUE IF NOT EXISTS 'REFUND_RELEASE';

-- The original payout relation was one-to-one. Durable payout debit/release
-- lifecycles require multiple typed entries per request; the schema has already
-- modeled this as a non-unique relation with a typed lookup index.
DROP INDEX IF EXISTS "restaurant_wallet_transactions_payout_request_id_key";

ALTER TABLE "payment_transactions"
  ADD COLUMN "refund_lifecycle_status" "RefundLifecycleStatus",
  ADD COLUMN "provider_idempotency_key" VARCHAR(191),
  ADD COLUMN "refund_lease_token" VARCHAR(191),
  ADD COLUMN "refund_lease_expires_at" TIMESTAMPTZ,
  ADD COLUMN "provider_succeeded_at" TIMESTAMPTZ,
  ADD COLUMN "refund_released_at" TIMESTAMPTZ,
  ADD COLUMN "refund_completed_at" TIMESTAMPTZ;

-- Completed legacy refunds are safe to adopt. Pending legacy rows are deliberately
-- quarantined because an old worker may already have committed at the provider.
UPDATE "payment_transactions"
SET "refund_lifecycle_status" = CASE
      WHEN "status" = 'REFUNDED' THEN 'COMPLETED'::"RefundLifecycleStatus"
      ELSE 'LEGACY_QUARANTINED'::"RefundLifecycleStatus"
    END,
    "refund_completed_at" = CASE
      WHEN "status" = 'REFUNDED' THEN COALESCE("processed_at", "updated_at")
      ELSE NULL
    END
WHERE "type" = 'REFUND' AND "refund_lifecycle_status" IS NULL;

CREATE UNIQUE INDEX CONCURRENTLY "payment_transactions_provider_idempotency_key"
  ON "payment_transactions"("provider_idempotency_key");
CREATE INDEX CONCURRENTLY "payment_transactions_refund_recovery_idx"
  ON "payment_transactions"("refund_lifecycle_status", "refund_lease_expires_at", "created_at");
