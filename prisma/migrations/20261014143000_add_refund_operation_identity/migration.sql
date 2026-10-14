ALTER TABLE "payment_transactions"
  ADD COLUMN "source_payment_transaction_id" TEXT,
  ADD COLUMN "idempotency_key" VARCHAR(64),
  ADD COLUMN "request_hash" VARCHAR(64);

CREATE UNIQUE INDEX CONCURRENTLY "payment_transactions_idempotency_key"
  ON "payment_transactions"("idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

CREATE INDEX CONCURRENTLY "payment_transactions_refund_source_status_idx"
  ON "payment_transactions"("source_payment_transaction_id", "type", "status");

-- Historical refunds are linked after deploy by the bounded SKIP LOCKED
-- backfill script. Keeping row updates out of the migration avoids a table-wide
-- data rewrite during schema rollout.

CREATE INDEX CONCURRENTLY "payment_transactions_legacy_refund_capacity_idx"
  ON "payment_transactions"("order_id", "type", "status")
  WHERE "source_payment_transaction_id" IS NULL AND "type" = 'REFUND';

CREATE INDEX CONCURRENTLY "payment_transactions_legacy_refund_backfill_idx"
  ON "payment_transactions"("id")
  WHERE "source_payment_transaction_id" IS NULL
    AND "type" = 'REFUND'
    AND "status" IN ('PENDING', 'REFUNDED');

ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_source_payment_transaction_id_fkey"
  FOREIGN KEY ("source_payment_transaction_id") REFERENCES "payment_transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;
ALTER TABLE "payment_transactions"
  VALIDATE CONSTRAINT "payment_transactions_source_payment_transaction_id_fkey";
