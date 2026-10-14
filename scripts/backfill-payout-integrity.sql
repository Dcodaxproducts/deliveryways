-- Run one bounded batch per invocation. Repeat until updated_rows = 0.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v batch_size=500 -f scripts/backfill-payout-integrity.sql
\if :{?batch_size}
\else
\set batch_size 500
\endif

BEGIN;
CREATE TEMP TABLE payout_backfill_batch ON COMMIT DROP AS
SELECT p.id
FROM restaurant_payout_requests p
WHERE p.operation_key IS NULL
ORDER BY p.created_at, p.id
FOR UPDATE SKIP LOCKED
LIMIT :batch_size;

WITH updated AS (
  UPDATE restaurant_payout_requests p
  SET operation_key = encode(sha256(convert_to('feastflow:financial-ledger:v1:payout:legacy:' || p.id, 'UTF8')), 'hex'),
      request_hash = encode(sha256(convert_to(p.tenant_id || '|' || p.restaurant_id || '|' || p.amount::text || '|' || upper(p.currency), 'UTF8')), 'hex'),
      provider_reference = COALESCE(p.provider_reference, p.payment_reference),
      provider_succeeded_at = CASE WHEN p.status = 'PAID' THEN COALESCE(p.paid_at, p.updated_at) ELSE p.provider_succeeded_at END
  FROM payout_backfill_batch b
  WHERE p.id = b.id
  RETURNING p.id
)
SELECT count(*) AS updated_rows FROM updated;
COMMIT;

-- Audit is read-only and classifies every unsafe adoption. Only exactly one
-- fully matching negative debit is eligible for runtime adoption.
SELECT p.id, p.tenant_id, p.restaurant_id, p.wallet_account_id, p.currency,
       p.amount, count(t.id) AS payout_debit_rows,
       count(t.id) FILTER (WHERE
         p.amount > 0
         AND t.amount < 0
         AND t.wallet_account_id = p.wallet_account_id
         AND t.tenant_id = p.tenant_id
         AND t.restaurant_id = p.restaurant_id
         AND upper(t.currency) = upper(p.currency)
         AND t.amount = -p.amount
       ) AS exact_matching_rows,
       CASE
         WHEN count(t.id) = 0 THEN 'ZERO_ROWS'
         WHEN count(t.id) > 1 THEN 'MULTIPLE_ROWS'
         WHEN count(t.id) FILTER (WHERE
           p.amount > 0
           AND t.amount < 0
           AND t.wallet_account_id = p.wallet_account_id
           AND t.tenant_id = p.tenant_id
           AND t.restaurant_id = p.restaurant_id
           AND upper(t.currency) = upper(p.currency)
           AND t.amount = -p.amount
         ) <> 1 THEN 'SCOPE_CURRENCY_OR_AMOUNT_MISMATCH'
         ELSE 'ELIGIBLE'
       END AS adoption_class
FROM restaurant_payout_requests p
LEFT JOIN restaurant_wallet_transactions t
  ON t.payout_request_id = p.id AND t.type = 'PAYOUT_DEBIT'
WHERE p.wallet_transaction_id IS NULL
GROUP BY p.id
HAVING count(t.id) <> 1 OR count(t.id) FILTER (WHERE
  p.amount > 0
  AND t.amount < 0
  AND t.wallet_account_id = p.wallet_account_id
  AND t.tenant_id = p.tenant_id
  AND t.restaurant_id = p.restaurant_id
  AND upper(t.currency) = upper(p.currency)
  AND t.amount = -p.amount
) <> 1
ORDER BY p.created_at, p.id;
