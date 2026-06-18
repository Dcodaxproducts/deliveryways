CREATE TYPE "PushPlatform" AS ENUM ('ANDROID', 'IOS');

CREATE TABLE "push_device_tokens" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "restaurant_id" TEXT,
  "branch_id" TEXT,
  "user_id" TEXT,
  "deliveryman_id" TEXT,
  "platform" "PushPlatform" NOT NULL,
  "token" TEXT NOT NULL,
  "device_id" TEXT,
  "app_package_name" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "push_device_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "push_device_tokens_token_key" ON "push_device_tokens"("token");
CREATE INDEX "push_device_tokens_user_id_is_active_platform_idx" ON "push_device_tokens"("user_id", "is_active", "platform");
CREATE INDEX "push_device_tokens_deliveryman_id_is_active_platform_idx" ON "push_device_tokens"("deliveryman_id", "is_active", "platform");
CREATE INDEX "push_device_tokens_restaurant_id_branch_id_is_active_platform_idx" ON "push_device_tokens"("restaurant_id", "branch_id", "is_active", "platform");

ALTER TABLE "push_device_tokens" ADD CONSTRAINT "push_device_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "push_device_tokens" ADD CONSTRAINT "push_device_tokens_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "push_device_tokens" ADD CONSTRAINT "push_device_tokens_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "push_device_tokens" ADD CONSTRAINT "push_device_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "push_device_tokens" ADD CONSTRAINT "push_device_tokens_deliveryman_id_fkey" FOREIGN KEY ("deliveryman_id") REFERENCES "deliverymen"("id") ON DELETE CASCADE ON UPDATE CASCADE;
