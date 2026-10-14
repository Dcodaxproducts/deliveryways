-- Hard predeploy gate for payout/refund application paths and workers.
-- Run only after both concurrent-index scripts, with ON_ERROR_STOP enabled.
\set ON_ERROR_STOP on

DO $verify$
DECLARE
  missing_indexes text;
  invalid_indexes text;
BEGIN
  IF to_regclass(
    'public.restaurant_wallet_transactions_payout_request_id_key'
  ) IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Payout predeploy gate failed: obsolete unique index restaurant_wallet_transactions_payout_request_id_key still exists',
      HINT = 'Run scripts/create-payout-indexes-concurrently.sql outside a transaction, then rerun this gate.';
  END IF;

  WITH required(index_name) AS (
    VALUES
      ('restaurant_payout_requests_release_transaction_id_key'),
      ('restaurant_payout_requests_operation_key_key'),
      ('restaurant_payout_requests_provider_idempotency_key_key'),
      ('restaurant_wallet_transactions_payout_type_idx'),
      ('restaurant_payout_requests_recovery_idx'),
      ('restaurant_payout_requests_provider_ref_idx'),
      ('orders_restaurant_status_paid_created_idx'),
      ('payment_transactions_restaurant_order_payout_aggregate_idx'),
      ('coupons_source_payment_transaction_id_key'),
      ('payment_transactions_provider_idempotency_key'),
      ('payment_transactions_refund_recovery_idx')
  )
  SELECT string_agg(required.index_name, ', ' ORDER BY required.index_name)
  INTO missing_indexes
  FROM required
  LEFT JOIN pg_class index_class
    ON index_class.relname = required.index_name
   AND index_class.relkind = 'i'
   AND index_class.relnamespace = 'public'::regnamespace
  WHERE index_class.oid IS NULL;

  IF missing_indexes IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Payout predeploy gate failed: required indexes are absent: ' || missing_indexes,
      HINT = 'Run both payout concurrent-index scripts outside a transaction, then rerun this gate.';
  END IF;

  SELECT string_agg(index_class.relname, ', ' ORDER BY index_class.relname)
  INTO invalid_indexes
  FROM pg_index index_state
  JOIN pg_class index_class ON index_class.oid = index_state.indexrelid
  JOIN pg_class table_class ON table_class.oid = index_state.indrelid
  JOIN pg_namespace table_namespace
    ON table_namespace.oid = table_class.relnamespace
  WHERE table_namespace.nspname = 'public'
    AND table_class.relname IN (
      'coupons',
      'orders',
      'payment_transactions',
      'restaurant_payout_requests',
      'restaurant_wallet_transactions'
    )
    AND (
      NOT index_state.indisvalid
      OR NOT index_state.indisready
      OR NOT index_state.indislive
    );

  IF invalid_indexes IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Payout predeploy gate failed: invalid/incomplete rollout indexes: ' || invalid_indexes,
      HINT = 'Do not enable application paths. Inspect, drop only failed indexes CONCURRENTLY, rerun the owning index script, and rerun this gate.';
  END IF;
END
$verify$;

SELECT 'payout predeploy index gate passed' AS result;
