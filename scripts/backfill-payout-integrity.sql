-- Dry-run first. This script reports legacy payout rows that cannot be safely auto-adopted.
-- Run with: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/backfill-payout-integrity.sql
SELECT p.id, p.tenant_id, p.restaurant_id, p.status,
       count(t.id) AS matching_wallet_transactions
FROM restaurant_payout_requests p
LEFT JOIN restaurant_wallet_transactions t
  ON t.payout_request_id = p.id AND t.type = 'PAYOUT_DEBIT'
GROUP BY p.id
HAVING count(t.id) > 1
ORDER BY p.created_at;

-- Rows returned above must be quarantined and reconciled against the provider before rollout.
-- Rows with exactly one matching debit are naturally adopted by payout_request_id at runtime.
