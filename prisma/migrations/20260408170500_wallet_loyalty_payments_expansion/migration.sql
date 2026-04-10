-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('CREDIT', 'DEBIT', 'ADJUSTMENT', 'REFUND', 'PAYMENT_REVERSAL', 'LOYALTY_REDEMPTION');

-- CreateEnum
CREATE TYPE "LoyaltyTransactionType" AS ENUM ('EARN', 'REDEEM', 'RESTORE', 'ADJUSTMENT', 'EXPIRE');

-- CreateEnum
CREATE TYPE "LoyaltyRedemptionTarget" AS ENUM ('WALLET', 'ORDER_DISCOUNT');

-- AlterTable
ALTER TABLE "orders"
ADD COLUMN IF NOT EXISTS "wallet_applied_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "loyalty_discount_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "loyalty_points_redeemed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "loyalty_points_awarded" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "wallet_accounts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wallet_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" TEXT NOT NULL,
    "wallet_account_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT,
    "payment_transaction_id" TEXT,
    "type" "WalletTransactionType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "balance_after" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PKR',
    "note" TEXT,
    "metadata" JSONB,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_programs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "points_per_currency_unit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency_amount_per_point" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "redemption_value_per_point" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "minimum_redeem_points" INTEGER NOT NULL DEFAULT 0,
    "allow_wallet_conversion" BOOLEAN NOT NULL DEFAULT true,
    "allow_order_discount" BOOLEAN NOT NULL DEFAULT true,
    "points_expiry_days" INTEGER,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "loyalty_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_accounts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "available_points" INTEGER NOT NULL DEFAULT 0,
    "lifetime_earned_points" INTEGER NOT NULL DEFAULT 0,
    "lifetime_redeemed_points" INTEGER NOT NULL DEFAULT 0,
    "manual_adjusted_points" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "loyalty_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "loyalty_account_id" TEXT NOT NULL,
    "loyalty_program_id" TEXT,
    "tenant_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "branch_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "order_id" TEXT,
    "payment_transaction_id" TEXT,
    "type" "LoyaltyTransactionType" NOT NULL,
    "points" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "monetary_value" DECIMAL(10,2),
    "redemption_target" "LoyaltyRedemptionTarget",
    "note" TEXT,
    "metadata" JSONB,
    "expires_at" TIMESTAMPTZ,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_accounts_tenant_id_restaurant_id_idx" ON "wallet_accounts"("tenant_id", "restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_accounts_restaurant_id_customer_id_key" ON "wallet_accounts"("restaurant_id", "customer_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_account_id_created_at_idx" ON "wallet_transactions"("wallet_account_id", "created_at");

-- CreateIndex
CREATE INDEX "wallet_transactions_customer_id_created_at_idx" ON "wallet_transactions"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "wallet_transactions_order_id_created_at_idx" ON "wallet_transactions"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_programs_restaurant_id_key" ON "loyalty_programs"("restaurant_id");

-- CreateIndex
CREATE INDEX "loyalty_programs_tenant_id_restaurant_id_idx" ON "loyalty_programs"("tenant_id", "restaurant_id");

-- CreateIndex
CREATE INDEX "loyalty_accounts_tenant_id_restaurant_id_idx" ON "loyalty_accounts"("tenant_id", "restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_accounts_restaurant_id_customer_id_key" ON "loyalty_accounts"("restaurant_id", "customer_id");

-- CreateIndex
CREATE INDEX "loyalty_transactions_loyalty_account_id_created_at_idx" ON "loyalty_transactions"("loyalty_account_id", "created_at");

-- CreateIndex
CREATE INDEX "loyalty_transactions_customer_id_created_at_idx" ON "loyalty_transactions"("customer_id", "created_at");

-- CreateIndex
CREATE INDEX "loyalty_transactions_order_id_created_at_idx" ON "loyalty_transactions"("order_id", "created_at");

-- AddForeignKey
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_accounts" ADD CONSTRAINT "wallet_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_account_id_fkey" FOREIGN KEY ("wallet_account_id") REFERENCES "wallet_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_payment_transaction_id_fkey" FOREIGN KEY ("payment_transaction_id") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_programs" ADD CONSTRAINT "loyalty_programs_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_loyalty_account_id_fkey" FOREIGN KEY ("loyalty_account_id") REFERENCES "loyalty_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_loyalty_program_id_fkey" FOREIGN KEY ("loyalty_program_id") REFERENCES "loyalty_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_payment_transaction_id_fkey" FOREIGN KEY ("payment_transaction_id") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
