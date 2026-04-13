/*
  Customer accounts are restaurant-scoped, so email uniqueness must also be
  restaurant-scoped. This preserves duplicate-customer protection within a
  restaurant while allowing the same email across different restaurants.
*/

-- DropIndex
DROP INDEX IF EXISTS "users_email_key";

-- CreateIndex
CREATE UNIQUE INDEX "users_email_restaurant_id_key" ON "users"("email", "restaurant_id");
