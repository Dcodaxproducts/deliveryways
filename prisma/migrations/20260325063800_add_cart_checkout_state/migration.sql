ALTER TABLE "carts"
ADD COLUMN "payment_method" "PaymentMethod",
ADD COLUMN "order_time" TIMESTAMPTZ;
