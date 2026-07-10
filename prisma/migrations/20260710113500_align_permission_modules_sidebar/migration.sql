-- Keep the active permission module catalog aligned with the restaurant-admin
-- main sidebar. Old submodule/alias rows stay in place for existing staff role
-- JSON permissions, but are hidden from the active catalog.

WITH canonical_modules(id, access_key, name, description, default_actions, sort_order) AS (
  VALUES
    ('perm_dashboard_main', 'dashboard', 'Dashboard', 'Dashboard overview and metrics', '["read"]'::jsonb, 10),
    ('perm_branch_management_main', 'branch-management', 'Branch Management', 'Restaurant branch list and branch management access', '["read","write","create","update","delete","manage"]'::jsonb, 20),
    ('perm_menu_management_main', 'menu-management', 'Menu Management', 'Menu catalog, schedules, modifiers, variations, and cuisines', '["read","write","create","update","delete","manage"]'::jsonb, 30),
    ('perm_order_management_main', 'order-management', 'Order Management', 'Order list, details, and lifecycle actions', '["read","write","create","update","delete","manage"]'::jsonb, 40),
    ('perm_table_reservations_main', 'table-reservations', 'Table Reservations', 'Table reservation requests and status management', '["read","write","create","update","delete","manage"]'::jsonb, 50),
    ('perm_pos_management_main', 'pos-management', 'POS Management', 'Point-of-sale ordering and table operations', '["read","write","create","update","delete","manage"]'::jsonb, 60),
    ('perm_customer_management_main', 'customer-management', 'Customer Management', 'Customer list, profiles, loyalty, and wallet history', '["read","write","create","update","delete","manage"]'::jsonb, 70),
    ('perm_contact_submissions_main', 'contact-submissions', 'Contact Submissions', 'Customer contact form submissions', '["read","write","create","update","delete","manage"]'::jsonb, 80),
    ('perm_loyalty_program_main', 'loyalty-program', 'Loyalty Program', 'Loyalty program configuration and point adjustments', '["read","write","create","update","delete","manage"]'::jsonb, 90),
    ('perm_deliveryman_main', 'deliveryman', 'Deliveryman', 'Deliveryman account and availability management', '["read","write","create","update","delete","manage"]'::jsonb, 100),
    ('perm_employees_main', 'employees', 'Employees', 'Employee accounts, roles, and permissions', '["read","write","create","update","delete","manage"]'::jsonb, 110),
    ('perm_promotion_management_main', 'promotion-management', 'Promotion Management', 'Coupons, deals, promotions, and happy hours', '["read","write","create","update","delete","manage"]'::jsonb, 120),
    ('perm_content_management_main', 'content-management', 'Content Management', 'Localized and public content management', '["read","write","create","update","delete","manage"]'::jsonb, 130),
    ('perm_profile_main', 'profile', 'Profile', 'Restaurant and account profile settings', '["read","write","update","manage"]'::jsonb, 140),
    ('perm_auto_printing_pos_main', 'auto-printing-pos', 'Auto-Printing/POS', 'Auto-printing and POS device settings', '["read","write","update","manage"]'::jsonb, 150),
    ('perm_reports_payouts_main', 'reports-payouts', 'Reports & Payouts', 'Reports, exports, invoices, and payout summaries', '["read","write","create","update","manage"]'::jsonb, 160),
    ('perm_payment_settings_main', 'payment-settings', 'Payment Settings', 'Payment methods, subscriptions, and billing settings', '["read","write","create","update","delete","manage"]'::jsonb, 170),
    ('perm_notifications_main', 'notifications', 'Notifications', 'Notifications and support chat access', '["read","reply","assign","resolve","write","manage"]'::jsonb, 180),
    ('perm_storefront_settings_main', 'storefront-settings', 'Storefront Settings', 'Customer storefront settings and public app content', '["read","write","update","manage"]'::jsonb, 190)
)
INSERT INTO "permission_modules" (
  "id",
  "access_key",
  "name",
  "description",
  "default_actions",
  "sort_order",
  "is_active"
)
SELECT id, access_key, name, description, default_actions, sort_order, true
FROM canonical_modules
ON CONFLICT ("access_key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "default_actions" = EXCLUDED."default_actions",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true,
  "updated_at" = CURRENT_TIMESTAMP;

UPDATE "permission_modules"
SET "is_active" = false,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "access_key" IN (
  'orders',
  'pos',
  'menu',
  'restaurant-menus',
  'branch_management',
  'menu-categories',
  'menu-items',
  'modifiers',
  'modifier-categories',
  'modifier-groups',
  'variations',
  'branch-overrides',
  'cuisines',
  'customers',
  'staff-roles',
  'staff-management',
  'coupons',
  'promotions',
  'inventory',
  'reports',
  'settings',
  'chat'
);
