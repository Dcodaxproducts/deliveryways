CREATE TYPE "PaymentFeePayer" AS ENUM ('CUSTOMER', 'RESTAURANT');

ALTER TABLE "orders"
ADD COLUMN "transaction_fee_type" "ServiceChargeType",
ADD COLUMN "transaction_fee_value" DECIMAL(10, 2),
ADD COLUMN "transaction_fee_amount" DECIMAL(10, 2) NOT NULL DEFAULT 0,
ADD COLUMN "transaction_fee_payer" "PaymentFeePayer";
