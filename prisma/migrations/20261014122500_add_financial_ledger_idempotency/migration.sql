-- Phase 1: metadata-only expansion. Existing rows remain nullable so this does not
-- rewrite the hot ledger tables. Runtime adoption repairs a legacy row when its
-- canonical natural identity is replayed.
ALTER TABLE "wallet_transactions"
  ADD COLUMN "idempotency_key" VARCHAR(64),
  ADD COLUMN "request_hash" VARCHAR(64);

ALTER TABLE "restaurant_wallet_transactions"
  ADD COLUMN "idempotency_key" VARCHAR(64),
  ADD COLUMN "request_hash" VARCHAR(64);

ALTER TABLE "loyalty_transactions"
  ADD COLUMN "request_hash" VARCHAR(64);

ALTER TABLE "wallet_transactions"
  ALTER COLUMN "idempotency_key" SET DEFAULT encode(sha256(convert_to((random())::text || (clock_timestamp())::text, 'UTF8')), 'hex');
ALTER TABLE "restaurant_wallet_transactions"
  ALTER COLUMN "idempotency_key" SET DEFAULT encode(sha256(convert_to((random())::text || (clock_timestamp())::text, 'UTF8')), 'hex');
