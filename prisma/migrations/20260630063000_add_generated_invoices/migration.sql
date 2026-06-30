CREATE TYPE "GeneratedInvoiceKind" AS ENUM ('ORDER', 'SUBSCRIPTION', 'WEEKLY_PAYOUT');
CREATE TYPE "GeneratedInvoiceStatus" AS ENUM ('ISSUED', 'SENT');
CREATE TYPE "GeneratedInvoiceEventType" AS ENUM ('GENERATED', 'DOWNLOADED', 'EMAILED');

CREATE TABLE "generated_invoices" (
  "id" TEXT NOT NULL,
  "invoice_number" VARCHAR(100) NOT NULL,
  "kind" "GeneratedInvoiceKind" NOT NULL,
  "status" "GeneratedInvoiceStatus" NOT NULL DEFAULT 'ISSUED',
  "tenant_id" TEXT,
  "restaurant_id" TEXT,
  "branch_id" TEXT,
  "customer_id" TEXT,
  "order_id" TEXT,
  "subscription_id" TEXT,
  "source_key" VARCHAR(255) NOT NULL,
  "period_from" TIMESTAMPTZ,
  "period_to" TIMESTAMPTZ,
  "currency" VARCHAR(10) NOT NULL DEFAULT 'PKR',
  "total_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "snapshot" JSONB NOT NULL,
  "generated_by_id" TEXT,
  "sent_count" INTEGER NOT NULL DEFAULT 0,
  "downloaded_count" INTEGER NOT NULL DEFAULT 0,
  "last_sent_at" TIMESTAMPTZ,
  "last_sent_to" VARCHAR(320),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "generated_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "generated_invoice_events" (
  "id" TEXT NOT NULL,
  "generated_invoice_id" TEXT NOT NULL,
  "event_type" "GeneratedInvoiceEventType" NOT NULL,
  "actor_id" TEXT,
  "recipient_email" VARCHAR(320),
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "generated_invoice_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "generated_invoices_invoice_number_key" ON "generated_invoices"("invoice_number");
CREATE INDEX "generated_invoices_kind_source_key_idx" ON "generated_invoices"("kind", "source_key");
CREATE INDEX "generated_invoices_restaurant_id_created_at_idx" ON "generated_invoices"("restaurant_id", "created_at");
CREATE INDEX "generated_invoices_order_id_idx" ON "generated_invoices"("order_id");
CREATE INDEX "generated_invoices_subscription_id_idx" ON "generated_invoices"("subscription_id");
CREATE INDEX "generated_invoice_events_generated_invoice_id_created_at_idx" ON "generated_invoice_events"("generated_invoice_id", "created_at");

ALTER TABLE "generated_invoice_events"
ADD CONSTRAINT "generated_invoice_events_generated_invoice_id_fkey"
FOREIGN KEY ("generated_invoice_id") REFERENCES "generated_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
