-- Link issued gift cards to their source payment so fulfillment is one-time.
ALTER TABLE "coupons"
  ADD COLUMN "source_payment_transaction_id" TEXT;

-- Adopt legacy fulfilled cards only when the payment payload names the card and
-- tenant/restaurant scope agrees. Unreferenced legacy duplicates remain unlinked.
UPDATE "coupons" AS c
SET "source_payment_transaction_id" = p."id"
FROM "payment_transactions" AS p
WHERE c."kind" = 'GIFT_CARD'
  AND p."type" = 'CHARGE'
  AND p."status" = 'PAID'
  AND p."tenant_id" = c."tenant_id"
  AND p."restaurant_id" = c."restaurant_id"
  AND p."provider_data"->>'giftCardId' = c."id";

CREATE UNIQUE INDEX "coupons_source_payment_transaction_id_key"
  ON "coupons"("source_payment_transaction_id");
