-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/backfill-refund-source-links.sql
-- Optional override: add -v batch_size=500. The default is 1,000.
-- This file opens and commits exactly one transaction per invocation. It links
-- only refunds whose order has exactly one successful, scope-compatible charge.
-- Ambiguous rows remain NULL and continue to block runtime refunds.
\if :{?batch_size}
\else
\set batch_size 1000
\endif
\if :{?after_id}
\else
\set after_id ''
\endif

BEGIN;

WITH batch AS (
  SELECT refund."id",
         refund."order_id",
         refund."tenant_id",
         refund."restaurant_id",
         refund."currency"
  FROM "payment_transactions" AS refund
  WHERE refund."source_payment_transaction_id" IS NULL
    AND refund."type" = 'REFUND'
    AND refund."status" IN ('PENDING', 'REFUNDED')
    AND refund."order_id" IS NOT NULL
    AND (:'after_id' = '' OR refund."id" > :'after_id')
  ORDER BY refund."id"
  LIMIT :batch_size
  FOR UPDATE SKIP LOCKED
), eligible AS (
  SELECT batch."id" AS "refund_id", source."charge_id"
  FROM batch
  CROSS JOIN LATERAL (
    SELECT MIN(candidate."id") AS "charge_id", COUNT(*) AS "charge_count"
    FROM (
      SELECT charge."id"
      FROM "payment_transactions" AS charge
      WHERE charge."order_id" = batch."order_id"
        AND charge."tenant_id" = batch."tenant_id"
        AND charge."restaurant_id" = batch."restaurant_id"
        AND UPPER(charge."currency") = UPPER(batch."currency")
        AND charge."type" = 'CHARGE'
        AND charge."status" IN ('PAID', 'REFUNDED')
      ORDER BY charge."id"
      LIMIT 2
    ) AS candidate
  ) AS source
  WHERE source."charge_count" = 1
), updated AS (
  UPDATE "payment_transactions" AS refund
  SET "source_payment_transaction_id" = eligible."charge_id"
  FROM eligible
  WHERE refund."id" = eligible."refund_id"
  RETURNING refund."id"
)
SELECT
  (SELECT COUNT(*) FROM batch) AS "scanned_refunds",
  (SELECT COUNT(*) FROM updated) AS "linked_refunds",
  (SELECT MAX("id") FROM batch) AS "next_cursor";

COMMIT;
