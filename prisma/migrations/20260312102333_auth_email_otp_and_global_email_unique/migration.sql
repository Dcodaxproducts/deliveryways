/*
  Warnings:

  - A unique constraint covering the columns `[email]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "users_email_restaurant_id_key";

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "verification_otp" TEXT,
ADD COLUMN     "verification_otp_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "verification_otp_expires_at" TIMESTAMPTZ;

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
