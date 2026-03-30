CREATE TYPE "ChatThreadStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');
CREATE TYPE "ChatThreadSource" AS ENUM ('SUPPORT', 'ORDER');
CREATE TYPE "ChatMessageSenderType" AS ENUM ('CUSTOMER', 'ADMIN', 'STAFF');

CREATE TABLE "chat_threads" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "restaurant_id" TEXT NOT NULL,
  "branch_id" TEXT,
  "customer_id" TEXT NOT NULL,
  "order_id" TEXT,
  "source" "ChatThreadSource" NOT NULL DEFAULT 'SUPPORT',
  "subject" TEXT,
  "status" "ChatThreadStatus" NOT NULL DEFAULT 'OPEN',
  "assigned_staff_user_id" TEXT,
  "last_message_preview" TEXT,
  "last_message_at" TIMESTAMPTZ NOT NULL,
  "customer_unread_count" INTEGER NOT NULL DEFAULT 0,
  "staff_unread_count" INTEGER NOT NULL DEFAULT 0,
  "customer_last_read_at" TIMESTAMPTZ,
  "staff_last_read_at" TIMESTAMPTZ,
  "resolved_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_threads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "chat_messages" (
  "id" TEXT NOT NULL,
  "thread_id" TEXT NOT NULL,
  "sender_type" "ChatMessageSenderType" NOT NULL,
  "sender_user_id" TEXT,
  "sender_staff_user_id" TEXT,
  "body" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "chat_threads_tenant_id_restaurant_id_status_last_message_at_idx"
  ON "chat_threads"("tenant_id", "restaurant_id", "status", "last_message_at");
CREATE INDEX "chat_threads_branch_id_status_last_message_at_idx"
  ON "chat_threads"("branch_id", "status", "last_message_at");
CREATE INDEX "chat_threads_customer_id_status_last_message_at_idx"
  ON "chat_threads"("customer_id", "status", "last_message_at");
CREATE INDEX "chat_threads_order_id_status_last_message_at_idx"
  ON "chat_threads"("order_id", "status", "last_message_at");
CREATE INDEX "chat_threads_assigned_staff_user_id_status_last_message_at_idx"
  ON "chat_threads"("assigned_staff_user_id", "status", "last_message_at");

CREATE INDEX "chat_messages_thread_id_created_at_idx"
  ON "chat_messages"("thread_id", "created_at");
CREATE INDEX "chat_messages_sender_user_id_created_at_idx"
  ON "chat_messages"("sender_user_id", "created_at");
CREATE INDEX "chat_messages_sender_staff_user_id_created_at_idx"
  ON "chat_messages"("sender_staff_user_id", "created_at");

ALTER TABLE "chat_threads"
  ADD CONSTRAINT "chat_threads_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "chat_threads_restaurant_id_fkey"
    FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "chat_threads_branch_id_fkey"
    FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "chat_threads_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "chat_threads_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "chat_threads_assigned_staff_user_id_fkey"
    FOREIGN KEY ("assigned_staff_user_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "chat_messages"
  ADD CONSTRAINT "chat_messages_thread_id_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "chat_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "chat_messages_sender_user_id_fkey"
    FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "chat_messages_sender_staff_user_id_fkey"
    FOREIGN KEY ("sender_staff_user_id") REFERENCES "staff_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
