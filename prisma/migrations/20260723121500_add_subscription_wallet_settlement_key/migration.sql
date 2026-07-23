ALTER TABLE "restaurant_wallet_transactions"
ADD COLUMN "subscription_invoice_key" VARCHAR(255);

CREATE UNIQUE INDEX "restaurant_wallet_transactions_subscription_invoice_key_key"
ON "restaurant_wallet_transactions"("subscription_invoice_key");
