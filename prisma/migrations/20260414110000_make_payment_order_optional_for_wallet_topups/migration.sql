/*
  Wallet top-ups need Stripe-backed payment transactions that are not tied to an
  order. This makes payment_transactions.order_id optional while keeping order
  payments fully supported.
*/

ALTER TABLE "payment_transactions"
ALTER COLUMN "order_id" DROP NOT NULL;
