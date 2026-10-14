-- One bounded, resumable transaction per invocation.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v batch_size=500 -v after_id='' -f scripts/backfill-gift-card-source-payments.sql
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
  SELECT c."id", candidate."payment_id"
  FROM "coupons" c
  CROSS JOIN LATERAL (
    SELECT MIN(matches."id") AS "payment_id", COUNT(*) AS "match_count"
    FROM (
      SELECT p."id"
      FROM "payment_transactions" p
      WHERE p."type" = 'CHARGE'
        AND p."status" = 'PAID'
        AND p."tenant_id" = c."tenant_id"
        AND p."restaurant_id" = c."restaurant_id"
        AND p."provider_data"->>'giftCardId' = c."id"
      ORDER BY p."id"
      LIMIT 2
    ) matches
  ) candidate
  WHERE c."kind" = 'GIFT_CARD'
    AND c."source_payment_transaction_id" IS NULL
    AND candidate."match_count" = 1
    AND (:'after_id' = '' OR c."id" > :'after_id')
    AND NOT EXISTS (
      SELECT 1 FROM "coupons" other
      WHERE other."source_payment_transaction_id" = candidate."payment_id"
    )
  ORDER BY c."id"
  LIMIT :batch_size
  FOR UPDATE OF c SKIP LOCKED
), updated AS (
  UPDATE "coupons" c SET "source_payment_transaction_id" = batch."payment_id"
  FROM batch WHERE c."id" = batch."id" RETURNING c."id"
)
SELECT (SELECT COUNT(*) FROM batch) AS scanned,
       (SELECT COUNT(*) FROM updated) AS updated,
       (SELECT MAX("id") FROM batch) AS next_cursor;
COMMIT;
