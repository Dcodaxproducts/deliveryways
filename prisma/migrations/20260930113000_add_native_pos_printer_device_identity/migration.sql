ALTER TABLE "staff_users"
ADD COLUMN "username" VARCHAR(64),
ADD COLUMN "username_normalized" VARCHAR(64),
ADD COLUMN "display_name" VARCHAR(160);

CREATE UNIQUE INDEX "staff_users_username_normalized_key"
ON "staff_users"("username_normalized");

ALTER TABLE "notifications"
ADD COLUMN "claimed_by_staff_user_id" TEXT;

ALTER TABLE "push_device_tokens"
ADD COLUMN "staff_user_id" TEXT;

CREATE INDEX "notifications_claimed_by_staff_user_id_seen_at_created_at_idx"
ON "notifications"("claimed_by_staff_user_id", "seen_at", "created_at");

CREATE INDEX "push_device_tokens_staff_user_id_is_active_platform_idx"
ON "push_device_tokens"("staff_user_id", "is_active", "platform");

ALTER TABLE "notifications"
ADD CONSTRAINT "notifications_claimed_by_staff_user_id_fkey"
FOREIGN KEY ("claimed_by_staff_user_id") REFERENCES "staff_users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "push_device_tokens"
ADD CONSTRAINT "push_device_tokens_staff_user_id_fkey"
FOREIGN KEY ("staff_user_id") REFERENCES "staff_users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
