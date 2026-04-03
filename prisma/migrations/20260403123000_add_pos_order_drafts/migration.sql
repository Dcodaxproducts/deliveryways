-- CreateEnum
CREATE TYPE "PosActorType" AS ENUM ('USER', 'STAFF');

-- CreateEnum
CREATE TYPE "PosOrderDraftStatus" AS ENUM ('OPEN', 'CHECKED_OUT', 'CANCELLED');

-- CreateTable
CREATE TABLE "pos_order_drafts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "restaurant_id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "created_by_actor_id" TEXT NOT NULL,
    "created_by_actor_type" "PosActorType" NOT NULL,
    "customer_id" TEXT,
    "order_type" "OrderType" NOT NULL,
    "payment_method" "PaymentMethod",
    "guest_name" TEXT,
    "guest_phone" TEXT,
    "table_label" TEXT,
    "guest_count" INTEGER,
    "coupon_code" TEXT,
    "note" TEXT,
    "status" "PosOrderDraftStatus" NOT NULL DEFAULT 'OPEN',
    "checked_out_at" TIMESTAMPTZ,
    "final_order_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pos_order_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pos_order_draft_items" (
    "id" TEXT NOT NULL,
    "draft_id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "variation_id" TEXT,
    "quantity" INTEGER NOT NULL,
    "note" TEXT,
    "modifiers" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pos_order_draft_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pos_order_drafts_tenant_id_branch_id_status_created_at_idx" ON "pos_order_drafts"("tenant_id", "branch_id", "status", "created_at");
CREATE INDEX "pos_order_drafts_restaurant_id_branch_id_status_created_at_idx" ON "pos_order_drafts"("restaurant_id", "branch_id", "status", "created_at");
CREATE INDEX "pos_order_drafts_customer_id_created_at_idx" ON "pos_order_drafts"("customer_id", "created_at");
CREATE INDEX "pos_order_draft_items_draft_id_created_at_idx" ON "pos_order_draft_items"("draft_id", "created_at");

-- AddForeignKey
ALTER TABLE "pos_order_drafts" ADD CONSTRAINT "pos_order_drafts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_order_drafts" ADD CONSTRAINT "pos_order_drafts_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_order_drafts" ADD CONSTRAINT "pos_order_drafts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "pos_order_drafts" ADD CONSTRAINT "pos_order_drafts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pos_order_draft_items" ADD CONSTRAINT "pos_order_draft_items_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "pos_order_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
