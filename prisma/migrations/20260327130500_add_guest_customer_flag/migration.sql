ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "is_guest" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "users_role_is_guest_restaurant_id_idx"
  ON "users"("role", "is_guest", "restaurant_id");
