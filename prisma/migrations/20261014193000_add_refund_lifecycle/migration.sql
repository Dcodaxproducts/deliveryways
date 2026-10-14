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

-- The original payout relation was one-to-one. Its populated-table index is
-- dropped concurrently by the post-deploy index script.

ALTER TABLE "payment_transactions"
  ADD COLUMN "refund_lifecycle_status" "RefundLifecycleStatus",
  ADD COLUMN "provider_idempotency_key" VARCHAR(191),
  ADD COLUMN "refund_lease_token" VARCHAR(191),
  ADD COLUMN "refund_lease_expires_at" TIMESTAMPTZ,
  ADD COLUMN "provider_succeeded_at" TIMESTAMPTZ,
  ADD COLUMN "refund_released_at" TIMESTAMPTZ,
  ADD COLUMN "refund_completed_at" TIMESTAMPTZ;

-- Historical classification and hot-table indexes are deliberately outside
-- this metadata-only migration. Runtime quarantines NULL legacy lifecycle rows.
