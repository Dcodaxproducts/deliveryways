CREATE TYPE "StaffAccountType" AS ENUM ('STANDARD', 'POS_PRINTER');

ALTER TABLE "staff_users"
ADD COLUMN "account_type" "StaffAccountType" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "auth_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "users"
ADD COLUMN "auth_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "deliverymen"
ADD COLUMN "auth_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "staff_roles"
ADD COLUMN "system_key" TEXT;

CREATE UNIQUE INDEX "staff_roles_system_key_key"
ON "staff_roles"("system_key");

CREATE INDEX "staff_pos_printer_scope_active_idx"
ON "staff_users"("account_type", "tenant_id", "restaurant_id", "branch_id", "is_active");
