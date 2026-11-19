DROP INDEX IF EXISTS "payout_invoice_email_outbox_dispatch_idx";
DROP INDEX IF EXISTS "payout_invoice_email_outbox_claim_token_key";
DROP INDEX IF EXISTS "payout_invoice_email_outbox_provider_message_key_key";
ALTER TABLE "payout_invoice_email_outbox"
  DROP CONSTRAINT IF EXISTS "payout_invoice_email_outbox_claim_state_check",
  DROP CONSTRAINT IF EXISTS "payout_invoice_email_outbox_sent_state_check",
  DROP CONSTRAINT IF EXISTS "payout_invoice_email_outbox_claim_check",
  DROP CONSTRAINT IF EXISTS "payout_invoice_email_outbox_state_check",
  DROP COLUMN IF EXISTS "provider_accepted_at",
  DROP COLUMN IF EXISTS "next_attempt_at",
  DROP COLUMN IF EXISTS "claim_expires_at",
  DROP COLUMN IF EXISTS "claim_token",
  DROP COLUMN IF EXISTS "provider_message_key",
  DROP COLUMN IF EXISTS "delivery_state";
CREATE INDEX "payout_invoice_email_outbox_dispatch_idx" ON "payout_invoice_email_outbox"("sent_at", "claimed_at", "created_at");
ALTER TABLE "restaurant_payout_monthly_ledgers"
  DROP CONSTRAINT IF EXISTS "restaurant_payout_monthly_ledgers_opportunities_check",
  DROP COLUMN IF EXISTS "payout_opportunities",
  DROP COLUMN IF EXISTS "payout_cycle";
