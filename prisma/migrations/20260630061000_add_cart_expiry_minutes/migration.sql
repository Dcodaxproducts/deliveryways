-- Add configurable abandoned-cart expiry for Super Admin global settings.
ALTER TABLE "global_settings"
ADD COLUMN "cart_expiry_minutes" INTEGER NOT NULL DEFAULT 720;
