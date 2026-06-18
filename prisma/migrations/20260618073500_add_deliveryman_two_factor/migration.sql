ALTER TABLE "deliverymen"
ADD COLUMN "two_factor_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "two_factor_otp" TEXT,
ADD COLUMN "two_factor_otp_expires_at" TIMESTAMPTZ,
ADD COLUMN "two_factor_otp_attempts" INTEGER NOT NULL DEFAULT 0;
