ALTER TABLE "orders"
  ADD COLUMN "checkout_idempotency_key" VARCHAR(36),
  ADD COLUMN "checkout_request_hash" VARCHAR(64);

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_checkout_idempotency_pair_check"
  CHECK (
    ("checkout_idempotency_key" IS NULL AND "checkout_request_hash" IS NULL)
    OR
    ("checkout_idempotency_key" IS NOT NULL AND "checkout_request_hash" IS NOT NULL)
  );

CREATE UNIQUE INDEX "orders_checkout_idempotency_scope_key"
  ON "orders" (
    "tenant_id",
    "restaurant_id",
    "customer_id",
    "checkout_idempotency_key"
  );
