-- Read-only rollout gate. Every count must be zero before declaring completion.
SELECT
 (SELECT COUNT(*) FROM "coupons" WHERE "kind"='GIFT_CARD' AND "source_payment_transaction_id" IS NULL) AS unlinked_gift_cards,
 (SELECT COUNT(*) FROM "payment_transactions" WHERE "type"='REFUND' AND "refund_lifecycle_status" IS NULL) AS unclassified_refunds,
 (SELECT COUNT(*) FROM (SELECT "source_payment_transaction_id" FROM "coupons" WHERE "source_payment_transaction_id" IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1) d) AS duplicate_gift_sources,
 (SELECT COUNT(*) FROM (SELECT "provider_idempotency_key" FROM "payment_transactions" WHERE "provider_idempotency_key" IS NOT NULL GROUP BY 1 HAVING COUNT(*) > 1) d) AS duplicate_provider_keys;
