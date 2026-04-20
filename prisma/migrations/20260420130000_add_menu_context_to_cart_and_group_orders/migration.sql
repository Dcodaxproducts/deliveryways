ALTER TABLE "carts"
  ADD COLUMN "restaurant_menu_id" TEXT;

ALTER TABLE "group_order_sessions"
  ADD COLUMN "restaurant_menu_id" TEXT;

ALTER TABLE "carts"
  ADD CONSTRAINT "carts_restaurant_menu_id_fkey"
  FOREIGN KEY ("restaurant_menu_id") REFERENCES "restaurant_menus"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "group_order_sessions"
  ADD CONSTRAINT "group_order_sessions_restaurant_menu_id_fkey"
  FOREIGN KEY ("restaurant_menu_id") REFERENCES "restaurant_menus"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "carts_restaurant_menu_id_idx"
  ON "carts"("restaurant_menu_id");

CREATE INDEX "group_order_sessions_restaurant_menu_id_idx"
  ON "group_order_sessions"("restaurant_menu_id");
