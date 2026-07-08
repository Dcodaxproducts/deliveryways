CREATE TYPE "RestaurantWalletTransactionType" AS ENUM ('ORDER_CREDIT', 'PAYOUT_DEBIT', 'ADJUSTMENT');
CREATE TYPE "RestaurantPayoutRequestStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED');

CREATE TABLE "restaurant_wallet_accounts" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'PKR',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_wallet_accounts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "restaurant_wallet_accounts_restaurant_id_key" ON "restaurant_wallet_accounts"("restaurant_id");
CREATE INDEX "restaurant_wallet_accounts_tenant_id_idx" ON "restaurant_wallet_accounts"("tenant_id");

CREATE TABLE "restaurant_wallet_transactions" (
  "id" TEXT NOT NULL,
  "wallet_account_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "order_id" TEXT,
  "payment_transaction_id" TEXT,
  "payout_request_id" TEXT,
  "type" "RestaurantWalletTransactionType" NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "balance_after" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'PKR',
  "note" TEXT,
  "metadata" JSONB,
  "created_by" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_wallet_transactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "restaurant_wallet_transactions_payment_transaction_id_key" ON "restaurant_wallet_transactions"("payment_transaction_id");
CREATE UNIQUE INDEX "restaurant_wallet_transactions_payout_request_id_key" ON "restaurant_wallet_transactions"("payout_request_id");
CREATE INDEX "restaurant_wallet_transactions_wallet_account_id_created_at_idx" ON "restaurant_wallet_transactions"("wallet_account_id", "created_at");
CREATE INDEX "restaurant_wallet_transactions_restaurant_id_created_at_idx" ON "restaurant_wallet_transactions"("restaurant_id", "created_at");
ALTER TABLE "restaurant_wallet_transactions" ADD CONSTRAINT "restaurant_wallet_transactions_wallet_account_id_fkey" FOREIGN KEY ("wallet_account_id") REFERENCES "restaurant_wallet_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "restaurant_payout_requests" (
  "id" TEXT NOT NULL,
  "wallet_account_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "requested_by" TEXT,
  "reviewed_by" TEXT,
  "paid_by" TEXT,
  "status" "RestaurantPayoutRequestStatus" NOT NULL DEFAULT 'REQUESTED',
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'PKR',
  "bank_details" JSONB NOT NULL,
  "note" TEXT,
  "rejection_reason" TEXT,
  "approval_note" TEXT,
  "payment_reference" TEXT,
  "paid_note" TEXT,
  "approved_at" TIMESTAMPTZ,
  "rejected_at" TIMESTAMPTZ,
  "paid_at" TIMESTAMPTZ,
  "wallet_transaction_id" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "restaurant_payout_requests_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "restaurant_payout_requests_wallet_transaction_id_key" ON "restaurant_payout_requests"("wallet_transaction_id");
CREATE INDEX "restaurant_payout_requests_restaurant_id_status_created_at_idx" ON "restaurant_payout_requests"("restaurant_id", "status", "created_at");
CREATE INDEX "restaurant_payout_requests_tenant_id_status_created_at_idx" ON "restaurant_payout_requests"("tenant_id", "status", "created_at");
ALTER TABLE "restaurant_payout_requests" ADD CONSTRAINT "restaurant_payout_requests_wallet_account_id_fkey" FOREIGN KEY ("wallet_account_id") REFERENCES "restaurant_wallet_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "restaurant_wallet_accounts" ("id", "tenant_id", "restaurant_id", "balance", "currency")
SELECT
  'rwa_' || r."id",
  r."tenant_id",
  r."id",
  0,
  COALESCE(gs."default_currency", 'PKR')
FROM "restaurants" r
LEFT JOIN "global_settings" gs ON gs."scope_key" = 'GLOBAL'
WHERE r."deleted_at" IS NULL
ON CONFLICT ("restaurant_id") DO NOTHING;

INSERT INTO "restaurant_wallet_transactions" (
  "id",
  "wallet_account_id",
  "tenant_id",
  "restaurant_id",
  "branch_id",
  "order_id",
  "payment_transaction_id",
  "type",
  "amount",
  "balance_after",
  "currency",
  "note",
  "metadata"
)
SELECT
  'rwt_' || pt."id",
  rwa."id",
  pt."tenant_id",
  pt."restaurant_id",
  pt."branch_id",
  pt."order_id",
  pt."id",
  'ORDER_CREDIT'::"RestaurantWalletTransactionType",
  pt."amount",
  SUM(pt."amount") OVER (PARTITION BY pt."restaurant_id" ORDER BY pt."processed_at" NULLS LAST, pt."created_at", pt."id"),
  pt."currency",
  'Backfilled paid platform-collected order payment',
  jsonb_build_object('backfilled', true, 'paymentMethod', pt."payment_method")
FROM "payment_transactions" pt
JOIN "restaurant_wallet_accounts" rwa ON rwa."restaurant_id" = pt."restaurant_id"
WHERE pt."status" = 'PAID'
  AND pt."type" = 'CHARGE'
  AND pt."order_id" IS NOT NULL
  AND pt."payment_method" NOT IN ('COD', 'CARD_ON_DELIVERY', 'WALLET')
ON CONFLICT ("payment_transaction_id") DO NOTHING;

UPDATE "restaurant_wallet_accounts" rwa
SET "balance" = COALESCE(s.balance, 0)
FROM (
  SELECT "restaurant_id", SUM("amount") AS balance
  FROM "restaurant_wallet_transactions"
  WHERE "type" = 'ORDER_CREDIT'
  GROUP BY "restaurant_id"
) s
WHERE rwa."restaurant_id" = s."restaurant_id";
