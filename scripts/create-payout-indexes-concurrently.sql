-- This migration must remain outside an explicit transaction: PostgreSQL
-- requires CONCURRENTLY for online hot-table index maintenance.
DROP INDEX CONCURRENTLY IF EXISTS "restaurant_wallet_transactions_payout_request_id_key";
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "restaurant_payout_requests_release_transaction_id_key"
  ON "restaurant_payout_requests"("release_transaction_id") WHERE "release_transaction_id" IS NOT NULL;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "restaurant_payout_requests_operation_key_key"
  ON "restaurant_payout_requests"("operation_key") WHERE "operation_key" IS NOT NULL;
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "restaurant_payout_requests_provider_idempotency_key_key"
  ON "restaurant_payout_requests"("provider_idempotency_key") WHERE "provider_idempotency_key" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "restaurant_wallet_transactions_payout_type_idx"
  ON "restaurant_wallet_transactions"("payout_request_id", "type");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "restaurant_payout_requests_recovery_idx"
  ON "restaurant_payout_requests"("status", "lease_expires_at", "created_at");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "restaurant_payout_requests_provider_ref_idx"
  ON "restaurant_payout_requests"("provider", "provider_reference");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_restaurant_status_paid_created_idx"
  ON "orders"("restaurant_id", "status", "paid_at", "created_at");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "payment_transactions_restaurant_order_payout_aggregate_idx"
  ON "payment_transactions"("restaurant_id", "order_id", "type", "status");
