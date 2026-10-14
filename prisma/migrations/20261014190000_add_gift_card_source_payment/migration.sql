-- Link issued gift cards to their source payment so fulfillment is one-time.
ALTER TABLE "coupons"
  ADD COLUMN "source_payment_transaction_id" TEXT;

-- Durable outbox/claim record. This is a new empty table, so its constraints
-- do not scan or lock a hot historical relation.
CREATE TABLE "gift_card_email_effects" (
  "id" TEXT NOT NULL,
  "payment_transaction_id" TEXT NOT NULL,
  "message_id" VARCHAR(320) NOT NULL,
  "claim_token" VARCHAR(64),
  "lease_expires_at" TIMESTAMPTZ,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "completed_at" TIMESTAMPTZ,
  "last_error" VARCHAR(1000),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "gift_card_email_effects_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "gift_card_email_effects_payment_key" UNIQUE ("payment_transaction_id"),
  CONSTRAINT "gift_card_email_effects_payment_fkey" FOREIGN KEY ("payment_transaction_id")
    REFERENCES "payment_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "gift_card_email_effects_pending_idx"
  ON "gift_card_email_effects"("completed_at", "lease_expires_at", "created_at");

-- Historical adoption and the hot coupons uniqueness index are deliberately
-- run by bounded/concurrent operator scripts after deploy.
