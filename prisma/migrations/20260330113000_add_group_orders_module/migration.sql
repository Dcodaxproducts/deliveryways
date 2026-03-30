CREATE TYPE "GroupOrderStatus" AS ENUM ('OPEN', 'LOCKED', 'CHECKED_OUT', 'CANCELLED', 'EXPIRED');
CREATE TYPE "GroupOrderParticipantStatus" AS ENUM ('ACTIVE', 'LEFT', 'REMOVED');

CREATE TABLE "group_order_sessions" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "branch_id" TEXT NOT NULL,
  "host_user_id" TEXT NOT NULL,
  "order_type" "OrderType" NOT NULL,
  "delivery_address_id" TEXT,
  "coupon_code" TEXT,
  "order_time" TIMESTAMPTZ,
  "host_note" TEXT,
  "invite_code" TEXT NOT NULL,
  "status" "GroupOrderStatus" NOT NULL DEFAULT 'OPEN',
  "expires_at" TIMESTAMPTZ NOT NULL,
  "locked_at" TIMESTAMPTZ,
  "checked_out_at" TIMESTAMPTZ,
  "final_order_id" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_order_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "group_order_participants" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "is_host" BOOLEAN NOT NULL DEFAULT false,
  "status" "GroupOrderParticipantStatus" NOT NULL DEFAULT 'ACTIVE',
  "joined_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "left_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_order_participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "group_order_items" (
  "id" TEXT NOT NULL,
  "session_id" TEXT NOT NULL,
  "participant_id" TEXT NOT NULL,
  "menu_item_id" TEXT NOT NULL,
  "variation_id" TEXT,
  "quantity" INTEGER NOT NULL,
  "note" TEXT,
  "modifiers" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "group_order_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_order_sessions_invite_code_key" ON "group_order_sessions"("invite_code");
CREATE UNIQUE INDEX "group_order_sessions_final_order_id_key" ON "group_order_sessions"("final_order_id");
CREATE INDEX "group_order_sessions_tenant_id_restaurant_id_status_created_at_idx" ON "group_order_sessions"("tenant_id", "restaurant_id", "status", "created_at");
CREATE INDEX "group_order_sessions_branch_id_status_created_at_idx" ON "group_order_sessions"("branch_id", "status", "created_at");
CREATE INDEX "group_order_sessions_host_user_id_status_created_at_idx" ON "group_order_sessions"("host_user_id", "status", "created_at");
CREATE UNIQUE INDEX "group_order_participants_session_id_user_id_key" ON "group_order_participants"("session_id", "user_id");
CREATE INDEX "group_order_participants_user_id_status_joined_at_idx" ON "group_order_participants"("user_id", "status", "joined_at");
CREATE INDEX "group_order_items_session_id_created_at_idx" ON "group_order_items"("session_id", "created_at");
CREATE INDEX "group_order_items_participant_id_created_at_idx" ON "group_order_items"("participant_id", "created_at");

ALTER TABLE "group_order_sessions"
  ADD CONSTRAINT "group_order_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_order_sessions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_order_sessions_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_order_sessions_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "group_order_sessions_delivery_address_id_fkey" FOREIGN KEY ("delivery_address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "group_order_sessions_final_order_id_fkey" FOREIGN KEY ("final_order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "group_order_participants"
  ADD CONSTRAINT "group_order_participants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "group_order_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "group_order_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "group_order_items"
  ADD CONSTRAINT "group_order_items_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "group_order_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "group_order_items_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "group_order_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
