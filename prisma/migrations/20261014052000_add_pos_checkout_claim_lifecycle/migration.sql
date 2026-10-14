ALTER TABLE "pos_order_drafts"
  ADD COLUMN "checkout_request_hash" VARCHAR(64),
  ADD COLUMN "checkout_claim_token" VARCHAR(64),
  ADD COLUMN "checkout_claimed_at" TIMESTAMPTZ,
  ADD COLUMN "checkout_lease_expires_at" TIMESTAMPTZ,
  ADD COLUMN "checkout_attempt" INTEGER NOT NULL DEFAULT 0;
