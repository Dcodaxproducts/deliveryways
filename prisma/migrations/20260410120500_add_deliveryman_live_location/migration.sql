-- AlterTable
ALTER TABLE "deliverymen"
ADD COLUMN IF NOT EXISTS "current_lat" DECIMAL(10,7),
ADD COLUMN IF NOT EXISTS "current_lng" DECIMAL(10,7),
ADD COLUMN IF NOT EXISTS "location_updated_at" TIMESTAMPTZ;
