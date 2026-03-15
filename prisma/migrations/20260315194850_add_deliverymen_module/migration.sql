-- CreateEnum
CREATE TYPE "DeliverymanStatus" AS ENUM ('OFFLINE', 'AVAILABLE', 'BUSY', 'INACTIVE');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "assigned_at" TIMESTAMPTZ,
ADD COLUMN     "delivered_at" TIMESTAMPTZ,
ADD COLUMN     "deliveryman_id" TEXT;

-- CreateTable
CREATE TABLE "deliverymen" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "vehicle_type" TEXT,
    "vehicle_number" TEXT,
    "status" "DeliverymanStatus" NOT NULL DEFAULT 'OFFLINE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "deliverymen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deliverymen_restaurant_id_branch_id_status_is_active_idx" ON "deliverymen"("restaurant_id", "branch_id", "status", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "deliverymen_restaurant_id_email_key" ON "deliverymen"("restaurant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "deliverymen_branch_id_phone_key" ON "deliverymen"("branch_id", "phone");

-- CreateIndex
CREATE INDEX "orders_deliveryman_id_status_created_at_idx" ON "orders"("deliveryman_id", "status", "created_at");

-- AddForeignKey
ALTER TABLE "deliverymen" ADD CONSTRAINT "deliverymen_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverymen" ADD CONSTRAINT "deliverymen_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliverymen" ADD CONSTRAINT "deliverymen_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_deliveryman_id_fkey" FOREIGN KEY ("deliveryman_id") REFERENCES "deliverymen"("id") ON DELETE SET NULL ON UPDATE CASCADE;
