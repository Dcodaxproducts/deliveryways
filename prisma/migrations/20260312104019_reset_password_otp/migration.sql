-- AlterTable
ALTER TABLE "users" ADD COLUMN     "reset_password_otp" TEXT,
ADD COLUMN     "reset_password_otp_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reset_password_otp_expires_at" TIMESTAMPTZ;
