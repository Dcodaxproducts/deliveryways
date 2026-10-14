-- Idempotency keys make lease takeover safe for POS post-commit effects.
ALTER TABLE "loyalty_transactions"
    ADD COLUMN "idempotency_key" VARCHAR(191);

CREATE UNIQUE INDEX "loyalty_transactions_idempotency_key"
    ON "loyalty_transactions"("idempotency_key");

ALTER TABLE "notifications"
    ADD COLUMN "idempotency_key" VARCHAR(191),
    ADD COLUMN "delivery_claim_token" VARCHAR(64),
    ADD COLUMN "delivery_lease_expires_at" TIMESTAMPTZ;

CREATE UNIQUE INDEX "notifications_idempotency_key"
    ON "notifications"("idempotency_key");
