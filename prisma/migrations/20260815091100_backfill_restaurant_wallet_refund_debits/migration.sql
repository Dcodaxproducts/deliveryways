WITH eligible_refunds AS (
  SELECT
    pt."id" AS "payment_transaction_id",
    pt."tenant_id",
    pt."restaurant_id",
    pt."branch_id",
    pt."order_id",
    pt."payment_method",
    pt."amount",
    pt."currency",
    pt."processed_at",
    pt."created_at",
    rwa."id" AS "wallet_account_id",
    rwa."balance" AS "wallet_balance"
  FROM "payment_transactions" pt
  JOIN "restaurant_wallet_accounts" rwa
    ON rwa."restaurant_id" = pt."restaurant_id"
  LEFT JOIN "restaurant_wallet_transactions" rwt
    ON rwt."payment_transaction_id" = pt."id"
  WHERE pt."type" = 'REFUND'
    AND pt."status" = 'REFUNDED'
    AND pt."order_id" IS NOT NULL
    AND pt."payment_method" NOT IN ('COD', 'CARD_ON_DELIVERY', 'WALLET')
    AND rwt."id" IS NULL
    AND EXISTS (
      SELECT 1
      FROM "restaurant_wallet_transactions" credit
      WHERE credit."restaurant_id" = pt."restaurant_id"
        AND credit."order_id" = pt."order_id"
        AND credit."type" = 'ORDER_CREDIT'
    )
),
inserted_refunds AS (
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
    'rwt_' || er."payment_transaction_id",
    er."wallet_account_id",
    er."tenant_id",
    er."restaurant_id",
    er."branch_id",
    er."order_id",
    er."payment_transaction_id",
    'REFUND_DEBIT'::"RestaurantWalletTransactionType",
    er."amount",
    er."wallet_balance" - SUM(er."amount") OVER (
      PARTITION BY er."restaurant_id"
      ORDER BY er."processed_at" NULLS LAST, er."created_at", er."payment_transaction_id"
    ),
    er."currency",
    'Backfilled refunded platform-collected order debit',
    jsonb_build_object(
      'backfilled', true,
      'paymentMethod', er."payment_method"
    )
  FROM eligible_refunds er
  ON CONFLICT ("payment_transaction_id") DO NOTHING
  RETURNING "restaurant_id", "amount"
),
refund_totals AS (
  SELECT "restaurant_id", SUM("amount") AS "amount"
  FROM inserted_refunds
  GROUP BY "restaurant_id"
)
UPDATE "restaurant_wallet_accounts" rwa
SET "balance" = rwa."balance" - rt."amount"
FROM refund_totals rt
WHERE rwa."restaurant_id" = rt."restaurant_id";
