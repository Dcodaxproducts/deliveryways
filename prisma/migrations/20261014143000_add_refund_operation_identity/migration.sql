ALTER TABLE "payment_transactions"
  ADD COLUMN "source_payment_transaction_id" TEXT,
  ADD COLUMN "idempotency_key" VARCHAR(64),
  ADD COLUMN "request_hash" VARCHAR(64);

CREATE UNIQUE INDEX "payment_transactions_idempotency_key"
  ON "payment_transactions"("idempotency_key");

CREATE INDEX "payment_transactions_refund_source_status_idx"
  ON "payment_transactions"("source_payment_transaction_id", "type", "status");

UPDATE "payment_transactions" AS refund
SET "source_payment_transaction_id" = source."charge_id"
FROM (
  SELECT "order_id", MAX("id") AS "charge_id"
  FROM "payment_transactions"
  WHERE "type" = 'CHARGE' AND "order_id" IS NOT NULL
  GROUP BY "order_id"
  HAVING COUNT(*) = 1
) AS source
WHERE refund."type" = 'REFUND'
  AND refund."source_payment_transaction_id" IS NULL
  AND refund."order_id" = source."order_id";

ALTER TABLE "payment_transactions"
  ADD CONSTRAINT "payment_transactions_source_payment_transaction_id_fkey"
  FOREIGN KEY ("source_payment_transaction_id") REFERENCES "payment_transactions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
