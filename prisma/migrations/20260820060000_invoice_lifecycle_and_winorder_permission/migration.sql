ALTER TYPE "GeneratedInvoiceStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "GeneratedInvoiceEventType" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "GeneratedInvoiceEventType" ADD VALUE IF NOT EXISTS 'RECREATED';

INSERT INTO "permission_modules" (
  "id",
  "access_key",
  "name",
  "description",
  "default_actions",
  "sort_order",
  "is_active"
)
VALUES (
  'perm_winorder_integration_main',
  'winorder-integration',
  'WinOrder Integration',
  'WinOrder connection, mapping, credential, and health management',
  '["read","write","create","update","manage"]'::jsonb,
  200,
  true
)
ON CONFLICT ("access_key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "default_actions" = EXCLUDED."default_actions",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true,
  "updated_at" = CURRENT_TIMESTAMP;
