-- CreateEnum
CREATE TYPE "PackagePayoutCycle" AS ENUM ('DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- AlterTable
ALTER TABLE "package_plans"
  ADD COLUMN "commission_cap_amount" DECIMAL(10,2),
  ADD COLUMN "vat_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN "payout_cycle" "PackagePayoutCycle" NOT NULL DEFAULT 'WEEKLY',
  ADD COLUMN "terms_document_url" TEXT;

-- AlterTable
ALTER TABLE "tenant_subscriptions"
  ADD COLUMN "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "next_billing_at" TIMESTAMPTZ,
  ADD COLUMN "plan_snapshot" JSONB;
