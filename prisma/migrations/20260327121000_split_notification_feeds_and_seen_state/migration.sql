DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'NotificationAudience'
  ) THEN
    CREATE TYPE "NotificationAudience" AS ENUM ('CUSTOMER', 'ADMIN');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'NotificationChannel_new'
  ) THEN
    CREATE TYPE "NotificationChannel_new" AS ENUM ('EMAIL', 'IN_APP');
  END IF;
END $$;

ALTER TABLE "notifications"
  ADD COLUMN IF NOT EXISTS "audience" "NotificationAudience" NOT NULL DEFAULT 'CUSTOMER',
  ADD COLUMN IF NOT EXISTS "seen_at" TIMESTAMPTZ;

ALTER TABLE "notifications"
  ALTER COLUMN "recipient_email" DROP NOT NULL;

ALTER TABLE "notifications"
  ALTER COLUMN "channel" TYPE "NotificationChannel_new"
  USING ("channel"::text::"NotificationChannel_new");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'NotificationChannel'
  ) THEN
    ALTER TYPE "NotificationChannel" RENAME TO "NotificationChannel_old";
  END IF;
END $$;

ALTER TYPE "NotificationChannel_new" RENAME TO "NotificationChannel";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'NotificationChannel_old'
  ) THEN
    DROP TYPE "NotificationChannel_old";
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "notifications_audience_recipient_user_id_created_at_idx"
  ON "notifications"("audience", "recipient_user_id", "created_at");

CREATE INDEX IF NOT EXISTS "notifications_audience_restaurant_id_branch_id_created_at_idx"
  ON "notifications"("audience", "restaurant_id", "branch_id", "created_at");

CREATE INDEX IF NOT EXISTS "notifications_audience_seen_at_created_at_idx"
  ON "notifications"("audience", "seen_at", "created_at");
