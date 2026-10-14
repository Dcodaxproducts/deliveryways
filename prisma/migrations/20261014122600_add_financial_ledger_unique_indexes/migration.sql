-- Phase 2 is deliberately a separate migration: PostgreSQL forbids
-- CONCURRENTLY inside a transaction. prisma migrate deploy executes PostgreSQL
-- migration files without an implicit transaction in this repository.
CREATE UNIQUE INDEX CONCURRENTLY "wallet_transactions_idempotency_key"
  ON "wallet_transactions"("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE UNIQUE INDEX CONCURRENTLY "restaurant_wallet_transactions_idempotency_key"
  ON "restaurant_wallet_transactions"("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX CONCURRENTLY "wallet_transactions_payment_transaction_id_idx"
  ON "wallet_transactions"("payment_transaction_id");
