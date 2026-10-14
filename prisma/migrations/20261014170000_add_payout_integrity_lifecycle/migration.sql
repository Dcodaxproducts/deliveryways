-- Phase 1: metadata-only additive payout lifecycle. Historical data is handled by
-- the bounded SKIP LOCKED runbook; hot-table indexes are built concurrently later.
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
