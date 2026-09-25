CREATE TABLE "branch_menu_assignments" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "restaurant_menu_id" TEXT NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "branch_menu_assignments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "branch_menu_assignments_branch_id_restaurant_menu_id_key" ON "branch_menu_assignments"("branch_id", "restaurant_menu_id");
CREATE INDEX "branch_menu_assignments_tenant_id_restaurant_id_branch_id_idx" ON "branch_menu_assignments"("tenant_id", "restaurant_id", "branch_id");
CREATE UNIQUE INDEX "branch_menu_assignments_one_active_default_per_branch" ON "branch_menu_assignments"("branch_id") WHERE "is_default" = true AND "is_active" = true;
ALTER TABLE "branch_menu_assignments" ADD CONSTRAINT "branch_menu_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branch_menu_assignments" ADD CONSTRAINT "branch_menu_assignments_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "branch_menu_assignments" ADD CONSTRAINT "branch_menu_assignments_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_menu_assignments" ADD CONSTRAINT "branch_menu_assignments_restaurant_menu_id_fkey" FOREIGN KEY ("restaurant_menu_id") REFERENCES "restaurant_menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
