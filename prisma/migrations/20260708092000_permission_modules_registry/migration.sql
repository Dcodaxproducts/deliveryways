CREATE TABLE "permission_modules" (
  "id" TEXT NOT NULL,
  "access_key" VARCHAR(120) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "default_actions" JSONB NOT NULL DEFAULT '["read","write","create","update","delete","manage"]',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "permission_modules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "permission_modules_access_key_key" ON "permission_modules"("access_key");
CREATE INDEX "permission_modules_is_active_sort_order_idx" ON "permission_modules"("is_active", "sort_order");

INSERT INTO "permission_modules" ("id", "access_key", "name", "description", "default_actions", "sort_order") VALUES
  ('perm_dashboard', 'dashboard', 'Dashboard', 'Dashboard overview and metrics', '["read"]', 10),
  ('perm_orders', 'orders', 'Orders', 'Order list, details, and lifecycle actions', '["read","write","create","update","delete","manage"]', 20),
  ('perm_pos', 'pos', 'POS', 'Point-of-sale ordering and table operations', '["read","write","create","update","delete","manage"]', 30),
  ('perm_menu', 'menu', 'Menu', 'General menu access alias', '["read","write","create","update","delete","manage"]', 40),
  ('perm_menu_management', 'menu-management', 'Menu Management', 'Menu management access alias', '["read","write","create","update","delete","manage"]', 50),
  ('perm_restaurant_menus', 'restaurant-menus', 'Restaurant Menus', 'Restaurant menu schedules and availability', '["read","write","create","update","delete","manage"]', 60),
  ('perm_branch_management', 'branch_management', 'Branch Management', 'Restaurant branch list and branch management access', '["read","write","create","update","delete","manage"]', 65),
  ('perm_menu_categories', 'menu-categories', 'Menu Categories', 'Menu/category management', '["read","write","create","update","delete","manage"]', 70),
  ('perm_menu_items', 'menu-items', 'Menu Items', 'Menu item management', '["read","write","create","update","delete","manage"]', 80),
  ('perm_modifiers', 'modifiers', 'Modifiers', 'Modifier catalog management', '["read","write","create","update","delete","manage"]', 90),
  ('perm_modifier_categories', 'modifier-categories', 'Modifier Categories', 'Modifier category management', '["read","write","create","update","delete","manage"]', 100),
  ('perm_modifier_groups', 'modifier-groups', 'Modifier Groups', 'Modifier group management', '["read","write","create","update","delete","manage"]', 110),
  ('perm_variations', 'variations', 'Variations', 'Menu item variation management', '["read","write","create","update","delete","manage"]', 120),
  ('perm_branch_overrides', 'branch-overrides', 'Branch Overrides', 'Branch-specific menu overrides', '["read","write","create","update","delete","manage"]', 130),
  ('perm_cuisines', 'cuisines', 'Cuisines', 'Cuisine master-data selection', '["read","write","create","update","delete","manage"]', 140),
  ('perm_customers', 'customers', 'Customers', 'Customer list and profiles', '["read","write","create","update","delete","manage"]', 150),
  ('perm_staff_roles', 'staff-roles', 'Staff Roles', 'Staff role and permission management', '["read","write","create","update","delete","manage"]', 160),
  ('perm_staff_management', 'staff-management', 'Staff Management', 'Staff account management', '["read","write","create","update","delete","manage"]', 170),
  ('perm_coupons', 'coupons', 'Coupons', 'Coupons and deal campaigns', '["read","write","create","update","delete","manage"]', 180),
  ('perm_promotions', 'promotions', 'Promotions', 'Promotion management', '["read","write","create","update","delete","manage"]', 190),
  ('perm_inventory', 'inventory', 'Inventory', 'Inventory management', '["read","write","create","update","delete","manage"]', 200),
  ('perm_reports', 'reports', 'Reports', 'Reports and analytics', '["read"]', 210),
  ('perm_settings', 'settings', 'Settings', 'Restaurant and branch settings', '["read","write","create","update","delete","manage"]', 220),
  ('perm_chat', 'chat', 'Chat', 'Support chat management', '["read","reply","assign","resolve","write","manage"]', 230)
ON CONFLICT ("access_key") DO NOTHING;
