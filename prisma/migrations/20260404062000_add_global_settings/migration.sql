-- CreateEnum
CREATE TYPE "VatHandlingRule" AS ENUM ('INCLUSIVE', 'EXCLUSIVE', 'COMPLETED_TRANSACTIONS_ONLY');

-- CreateEnum
CREATE TYPE "CurrencyDisplayFormat" AS ENUM ('SYMBOL_AMOUNT', 'AMOUNT_CODE', 'CODE_AMOUNT');

-- CreateEnum
CREATE TYPE "PlatformDateFormat" AS ENUM ('DD_MM_YYYY', 'MM_DD_YYYY', 'YYYY_MM_DD');

-- CreateTable
CREATE TABLE "global_settings" (
    "id" TEXT NOT NULL,
    "scope_key" VARCHAR(20) NOT NULL DEFAULT 'GLOBAL',
    "global_tax_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat_handling_rule" "VatHandlingRule" NOT NULL DEFAULT 'EXCLUSIVE',
    "default_commission_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "default_hybrid_fee_percentage" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "default_currency" VARCHAR(10) NOT NULL DEFAULT 'PKR',
    "currency_display_format" "CurrencyDisplayFormat" NOT NULL DEFAULT 'SYMBOL_AMOUNT',
    "default_language" VARCHAR(16) NOT NULL DEFAULT 'en',
    "date_format" "PlatformDateFormat" NOT NULL DEFAULT 'DD_MM_YYYY',
    "timezone" VARCHAR(100) NOT NULL DEFAULT 'Asia/Karachi',
    "primary_color" VARCHAR(20),
    "secondary_color" VARCHAR(20),
    "font_family" VARCHAR(100),
    "is_tax_enforced" BOOLEAN NOT NULL DEFAULT false,
    "is_commission_enforced" BOOLEAN NOT NULL DEFAULT false,
    "is_currency_enforced" BOOLEAN NOT NULL DEFAULT false,
    "is_localization_enforced" BOOLEAN NOT NULL DEFAULT false,
    "created_by" VARCHAR(191),
    "updated_by" VARCHAR(191),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "global_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "global_settings_scope_key_key" ON "global_settings"("scope_key");
