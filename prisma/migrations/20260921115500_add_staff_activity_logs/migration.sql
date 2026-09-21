-- CreateEnum
CREATE TYPE "StaffActivityAction" AS ENUM ('LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'OTHER');

-- CreateTable
CREATE TABLE "staff_activity_logs" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "staff_user_id" TEXT NOT NULL,
    "staff_email" TEXT NOT NULL,
    "staff_name" TEXT NOT NULL,
    "staff_role_id" TEXT,
    "staff_role_name" TEXT,
    "panel_type" "StaffPanelType" NOT NULL,
    "action" "StaffActivityAction" NOT NULL,
    "module" VARCHAR(120) NOT NULL,
    "description" TEXT NOT NULL,
    "target_type" VARCHAR(120),
    "target_id" VARCHAR(191),
    "restaurant_id" TEXT,
    "restaurant_name" TEXT,
    "branch_id" TEXT,
    "branch_name" TEXT,
    "http_method" VARCHAR(12),
    "request_path" VARCHAR(500),
    "status_code" INTEGER,
    "ip_address" VARCHAR(100),
    "user_agent" VARCHAR(500),
    "changed_fields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "staff_activity_logs_owner_user_id_occurred_at_idx" ON "staff_activity_logs"("owner_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "staff_activity_logs_owner_user_id_staff_user_id_occur_idx" ON "staff_activity_logs"("owner_user_id", "staff_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "staff_activity_logs_owner_user_id_restaurant_id_occur_idx" ON "staff_activity_logs"("owner_user_id", "restaurant_id", "occurred_at");

-- CreateIndex
CREATE INDEX "staff_activity_logs_owner_user_id_action_occurred_at_idx" ON "staff_activity_logs"("owner_user_id", "action", "occurred_at");
