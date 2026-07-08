INSERT INTO "permission_modules" (
  "id",
  "access_key",
  "name",
  "description",
  "default_actions",
  "sort_order"
) VALUES (
  'perm_branch_management',
  'branch_management',
  'Branch Management',
  'Restaurant branch list and branch management access',
  '["read","write","create","update","delete","manage"]',
  65
)
ON CONFLICT ("access_key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "description" = EXCLUDED."description",
  "default_actions" = EXCLUDED."default_actions",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true;
