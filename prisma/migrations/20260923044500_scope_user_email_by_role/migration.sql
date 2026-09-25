-- Preserve same-role uniqueness while allowing separate customer and admin
-- identities to reuse an email within the same restaurant.
CREATE UNIQUE INDEX "users_email_restaurant_id_role_key"
ON "users"("email", "restaurant_id", "role");

DROP INDEX "users_email_restaurant_id_key";
