ALTER TYPE "NotificationAudience" ADD VALUE IF NOT EXISTS 'DELIVERYMAN';

ALTER TABLE "deliverymen"
ADD COLUMN "avatar_url" TEXT;

ALTER TABLE "notifications"
ADD COLUMN "deliveryman_id" TEXT;

CREATE INDEX "notifications_deliveryman_id_created_at_idx"
ON "notifications"("deliveryman_id", "created_at");

CREATE INDEX "notifications_audience_deliveryman_id_created_at_idx"
ON "notifications"("audience", "deliveryman_id", "created_at");

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_deliveryman_id_fkey"
FOREIGN KEY ("deliveryman_id") REFERENCES "deliverymen"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
