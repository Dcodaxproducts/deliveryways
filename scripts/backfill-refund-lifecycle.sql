-- One bounded, resumable legacy refund classification transaction.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v batch_size=500 -v after_id='' -f scripts/backfill-refund-lifecycle.sql
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
  SELECT "id" FROM "payment_transactions"
  WHERE "type" = 'REFUND' AND "refund_lifecycle_status" IS NULL
    AND (:'after_id' = '' OR "id" > :'after_id')
  ORDER BY "id" LIMIT :batch_size FOR UPDATE SKIP LOCKED
), updated AS (
  UPDATE "payment_transactions" p
  SET "refund_lifecycle_status" = CASE
        WHEN p."status" = 'REFUNDED' THEN 'COMPLETED'::"RefundLifecycleStatus"
        ELSE 'LEGACY_QUARANTINED'::"RefundLifecycleStatus" END,
      "refund_completed_at" = CASE WHEN p."status" = 'REFUNDED'
        THEN COALESCE(p."processed_at", p."updated_at") ELSE NULL END
  FROM batch WHERE p."id" = batch."id" RETURNING p."id"
)
SELECT (SELECT COUNT(*) FROM batch) AS scanned,
       (SELECT COUNT(*) FROM updated) AS updated,
       (SELECT MAX("id") FROM batch) AS next_cursor;
COMMIT;
