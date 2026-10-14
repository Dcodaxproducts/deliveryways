-- Add canonical ledger operation identities without rewriting existing business history.
ALTER TABLE "wallet_transactions"
  ADD COLUMN "idempotency_key" VARCHAR(64),
  ADD COLUMN "request_hash" VARCHAR(64);

ALTER TABLE "restaurant_wallet_transactions"
  ADD COLUMN "idempotency_key" VARCHAR(64),
  ADD COLUMN "request_hash" VARCHAR(64);

ALTER TABLE "loyalty_transactions"
  ADD COLUMN "request_hash" VARCHAR(64);

-- Legacy rows receive stable full SHA-256 identities before the new NOT NULL invariant.
UPDATE "wallet_transactions"
SET "idempotency_key" = encode(sha256(convert_to('legacy:customer-wallet:' || "id", 'UTF8')), 'hex')
WHERE "idempotency_key" IS NULL;

UPDATE "restaurant_wallet_transactions"
SET "idempotency_key" = encode(sha256(convert_to('legacy:restaurant-wallet:' || "id", 'UTF8')), 'hex')
WHERE "idempotency_key" IS NULL;

ALTER TABLE "wallet_transactions"
  ALTER COLUMN "idempotency_key" SET NOT NULL,
  ALTER COLUMN "idempotency_key" SET DEFAULT encode(sha256(convert_to((random())::text || (clock_timestamp())::text, 'UTF8')), 'hex');

ALTER TABLE "restaurant_wallet_transactions"
  ALTER COLUMN "idempotency_key" SET NOT NULL,
  ALTER COLUMN "idempotency_key" SET DEFAULT encode(sha256(convert_to((random())::text || (clock_timestamp())::text, 'UTF8')), 'hex');

CREATE UNIQUE INDEX "wallet_transactions_idempotency_key"
  ON "wallet_transactions"("idempotency_key");

CREATE UNIQUE INDEX "restaurant_wallet_transactions_idempotency_key"
  ON "restaurant_wallet_transactions"("idempotency_key");
