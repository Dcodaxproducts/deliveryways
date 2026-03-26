ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'STAFF';

CREATE TYPE "StaffRoleScope" AS ENUM ('SUPER_ADMIN', 'RESTAURANT', 'BRANCH');

CREATE TABLE "staff_roles" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "restaurant_id" TEXT,
  "branch_id" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "scope" "StaffRoleScope" NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "deleted_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "staff_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_role_permissions" (
  "id" TEXT NOT NULL,
  "staff_role_id" TEXT NOT NULL,
  "access" TEXT NOT NULL,
  "operations" TEXT[] NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "staff_role_permissions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "users"
ADD COLUMN "staff_role_id" TEXT;

CREATE INDEX "staff_roles_tenant_id_restaurant_id_branch_id_is_active_idx" ON "staff_roles"("tenant_id", "restaurant_id", "branch_id", "is_active");
CREATE INDEX "staff_role_permissions_staff_role_id_access_idx" ON "staff_role_permissions"("staff_role_id", "access");

ALTER TABLE "staff_roles"
ADD CONSTRAINT "staff_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "staff_roles_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE,
ADD CONSTRAINT "staff_roles_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "staff_role_permissions"
ADD CONSTRAINT "staff_role_permissions_staff_role_id_fkey" FOREIGN KEY ("staff_role_id") REFERENCES "staff_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "users"
ADD CONSTRAINT "users_staff_role_id_fkey" FOREIGN KEY ("staff_role_id") REFERENCES "staff_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
