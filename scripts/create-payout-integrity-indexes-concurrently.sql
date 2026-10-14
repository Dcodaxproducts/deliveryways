-- Must run with psql outside a transaction after duplicate audits pass.
\set ON_ERROR_STOP on
DROP INDEX CONCURRENTLY IF EXISTS "restaurant_wallet_transactions_payout_request_id_key";
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "coupons_source_payment_transaction_id_key"
  ON "coupons"("source_payment_transaction_id");
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS "payment_transactions_provider_idempotency_key"
  ON "payment_transactions"("provider_idempotency_key");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "payment_transactions_refund_recovery_idx"
  ON "payment_transactions"("refund_lifecycle_status", "refund_lease_expires_at", "created_at");
