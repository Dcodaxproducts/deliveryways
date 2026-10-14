-- psql: \set batch_size 1000
-- One bounded transaction per invocation. Generic hashes are safe because runtime
-- natural-identity adoption replaces them atomically on replay.
WITH batch AS (
  SELECT id FROM wallet_transactions
  WHERE idempotency_key IS NULL
  ORDER BY id
  LIMIT :batch_size
  FOR UPDATE SKIP LOCKED
)
UPDATE wallet_transactions AS target
SET idempotency_key = encode(sha256(convert_to('legacy:customer-wallet:' || target.id, 'UTF8')), 'hex')
FROM batch WHERE target.id = batch.id;

WITH batch AS (
  SELECT id FROM restaurant_wallet_transactions
  WHERE idempotency_key IS NULL
  ORDER BY id
  LIMIT :batch_size
  FOR UPDATE SKIP LOCKED
)
UPDATE restaurant_wallet_transactions AS target
SET idempotency_key = encode(sha256(convert_to('legacy:restaurant-wallet:' || target.id, 'UTF8')), 'hex')
FROM batch WHERE target.id = batch.id;
