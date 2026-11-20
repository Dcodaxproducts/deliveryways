BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "automatic_payout_transfers" LIMIT 1) THEN
    RAISE EXCEPTION 'rollback refused: automatic payout safety records exist';
  END IF;
END $$;
DROP TABLE "automatic_payout_transfers";
ALTER TABLE "restaurant_wallet_accounts"
  DROP CONSTRAINT "restaurant_wallet_reserved_payout_balance_check",
  DROP COLUMN "reserved_payout_balance";
DROP TYPE "AutomaticPayoutTransferState";
COMMIT;
