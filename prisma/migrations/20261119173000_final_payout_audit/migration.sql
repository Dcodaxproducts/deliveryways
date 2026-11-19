-- Cadence-aware monthly fee allocation and crash-safe payout email delivery.
BEGIN;

ALTER TABLE "restaurant_payout_monthly_ledgers"
  ADD COLUMN "payout_cycle" "PackagePayoutCycle",
  ADD COLUMN "payout_opportunities" INTEGER;

UPDATE "restaurant_payout_monthly_ledgers" AS ledger
SET "payout_cycle" = COALESCE(subscription."payout_cycle_override", plan."payout_cycle", 'WEEKLY'::"PackagePayoutCycle")
FROM "tenant_subscriptions" AS subscription
JOIN "package_plans" AS plan ON plan."id" = subscription."package_plan_id"
WHERE subscription."id" = ledger."subscription_id";

UPDATE "restaurant_payout_monthly_ledgers"
SET "payout_cycle" = COALESCE("payout_cycle", 'WEEKLY'::"PackagePayoutCycle"),
    "payout_opportunities" = CASE COALESCE("payout_cycle", 'WEEKLY'::"PackagePayoutCycle")
      WHEN 'DAILY'::"PackagePayoutCycle" THEN EXTRACT(DAY FROM (("local_month" || '-01')::date + INTERVAL '1 month - 1 day'))::integer
      WHEN 'BIWEEKLY'::"PackagePayoutCycle" THEN 2
      WHEN 'MONTHLY'::"PackagePayoutCycle" THEN 1
      ELSE 4
    END;

ALTER TABLE "restaurant_payout_monthly_ledgers"
  ALTER COLUMN "payout_cycle" SET DEFAULT 'WEEKLY'::"PackagePayoutCycle",
  ALTER COLUMN "payout_cycle" SET NOT NULL,
  ALTER COLUMN "payout_opportunities" SET DEFAULT 4,
  ALTER COLUMN "payout_opportunities" SET NOT NULL,
  ADD CONSTRAINT "restaurant_payout_monthly_ledgers_opportunities_check" CHECK ("payout_opportunities" BETWEEN 1 AND 31);

ALTER TABLE "payout_invoice_email_outbox"
  ADD COLUMN "delivery_state" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "provider_message_key" VARCHAR(255),
  ADD COLUMN "claim_token" VARCHAR(64),
  ADD COLUMN "claim_expires_at" TIMESTAMPTZ,
  ADD COLUMN "next_attempt_at" TIMESTAMPTZ,
  ADD COLUMN "provider_accepted_at" TIMESTAMPTZ,
  ADD COLUMN "reconciliation_required_at" TIMESTAMPTZ,
  ADD COLUMN "reconciled_at" TIMESTAMPTZ,
  ADD COLUMN "reconciled_by" TEXT,
  ADD COLUMN "reconciliation_note" VARCHAR(1000);

UPDATE "payout_invoice_email_outbox"
SET "provider_message_key" = 'payout-invoice-' || "generated_invoice_id" || '@deliveryways.app',
    "delivery_state" = CASE WHEN "sent_at" IS NULL THEN 'PENDING' ELSE 'SENT' END,
    "provider_accepted_at" = "sent_at";

ALTER TABLE "payout_invoice_email_outbox"
  ALTER COLUMN "provider_message_key" SET NOT NULL,
  ADD CONSTRAINT "payout_invoice_email_outbox_state_check" CHECK ("delivery_state" IN ('PENDING', 'PREPARING', 'SENDING', 'RETRY_WAIT', 'UNKNOWN', 'SENT', 'FAILED')),
  ADD CONSTRAINT "payout_invoice_email_outbox_claim_check" CHECK (("claim_token" IS NULL AND "claim_expires_at" IS NULL) OR ("claim_token" IS NOT NULL AND "claim_expires_at" IS NOT NULL)),
  ADD CONSTRAINT "payout_invoice_email_outbox_sent_state_check" CHECK (("delivery_state" = 'SENT') = ("sent_at" IS NOT NULL)),
  ADD CONSTRAINT "payout_invoice_email_outbox_claim_state_check" CHECK (("delivery_state" IN ('PREPARING', 'SENDING')) = ("claim_token" IS NOT NULL)),
  ADD CONSTRAINT "payout_invoice_email_outbox_reconciliation_state_check" CHECK (("delivery_state" = 'UNKNOWN') = ("reconciliation_required_at" IS NOT NULL)),
  ADD CONSTRAINT "payout_invoice_email_outbox_provider_accepted_check" CHECK (("delivery_state" = 'SENT') = ("provider_accepted_at" IS NOT NULL));

CREATE UNIQUE INDEX "payout_invoice_email_outbox_provider_message_key_key" ON "payout_invoice_email_outbox"("provider_message_key");
CREATE UNIQUE INDEX "payout_invoice_email_outbox_claim_token_key" ON "payout_invoice_email_outbox"("claim_token");
DROP INDEX "payout_invoice_email_outbox_dispatch_idx";
CREATE INDEX "payout_invoice_email_outbox_dispatch_idx" ON "payout_invoice_email_outbox"("delivery_state", "next_attempt_at", "claim_expires_at", "created_at");
CREATE INDEX "payout_invoice_email_outbox_reconciliation_idx" ON "payout_invoice_email_outbox"("reconciliation_required_at", "created_at") WHERE "delivery_state" = 'UNKNOWN';

COMMIT;
