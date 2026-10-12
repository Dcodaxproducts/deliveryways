CREATE TABLE "realtime_outbox_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "aggregate_type" VARCHAR(40) NOT NULL, "aggregate_id" TEXT NOT NULL,
  "event_name" VARCHAR(80) NOT NULL, "payload" JSONB NOT NULL, "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, "published_at" TIMESTAMPTZ, "failed_at" TIMESTAMPTZ,
  "last_error" VARCHAR(1000), "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "realtime_outbox_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "realtime_outbox_dispatch_idx" ON "realtime_outbox_events" ("published_at", "failed_at", "available_at", "created_at");
CREATE INDEX "realtime_outbox_aggregate_idx" ON "realtime_outbox_events" ("aggregate_type", "aggregate_id", "created_at");

CREATE OR REPLACE FUNCTION enqueue_realtime_order_event() RETURNS trigger AS $$
DECLARE event_name TEXT; compact JSONB;
BEGIN
  event_name := CASE WHEN TG_OP = 'INSERT' THEN 'order.created' WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'order.status.updated' ELSE 'order.updated' END;
  compact := jsonb_build_object('id', NEW.id, 'tenantId', NEW.tenant_id, 'restaurantId', NEW.restaurant_id, 'branchId', NEW.branch_id, 'customerId', NEW.customer_id, 'deliverymanId', NEW.deliveryman_id, 'status', NEW.status, 'orderType', NEW.order_type, 'paymentStatus', NEW.payment_status, 'totalAmount', NEW.total_amount, 'createdAt', NEW.created_at, 'updatedAt', NEW.updated_at);
  INSERT INTO realtime_outbox_events(aggregate_type, aggregate_id, event_name, payload) VALUES ('order', NEW.id, event_name, compact);
  INSERT INTO realtime_outbox_events(aggregate_type, aggregate_id, event_name, payload) VALUES ('order', NEW.id, 'order.tracking.updated', compact);
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER orders_realtime_outbox AFTER INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION enqueue_realtime_order_event();

CREATE OR REPLACE FUNCTION compact_chat_thread(thread chat_threads) RETURNS JSONB AS $$
  SELECT jsonb_build_object('id', thread.id, 'tenantId', thread.tenant_id, 'restaurantId', thread.restaurant_id, 'branchId', thread.branch_id, 'customerId', thread.customer_id, 'orderId', thread.order_id, 'deliverymanId', thread.deliveryman_id, 'source', thread.source, 'subject', left(thread.subject, 300), 'status', thread.status, 'assignedStaffUserId', thread.assigned_staff_user_id, 'lastMessagePreview', left(thread.last_message_preview, 500), 'lastMessageAt', thread.last_message_at, 'customerUnreadCount', thread.customer_unread_count, 'staffUnreadCount', thread.staff_unread_count, 'customerLastReadAt', thread.customer_last_read_at, 'staffLastReadAt', thread.staff_last_read_at, 'resolvedAt', thread.resolved_at, 'createdAt', thread.created_at, 'updatedAt', thread.updated_at);
$$ LANGUAGE sql IMMUTABLE;
CREATE OR REPLACE FUNCTION enqueue_realtime_chat_thread_event() RETURNS trigger AS $$
DECLARE event_name TEXT; compact JSONB;
BEGIN
  compact := compact_chat_thread(NEW); event_name := CASE WHEN TG_OP = 'INSERT' THEN 'chat.thread.created' ELSE 'chat.thread.updated' END;
  INSERT INTO realtime_outbox_events(aggregate_type, aggregate_id, event_name, payload) VALUES ('chat', NEW.id, event_name, compact);
  IF TG_OP = 'UPDATE' AND (OLD.customer_unread_count IS DISTINCT FROM NEW.customer_unread_count OR OLD.staff_unread_count IS DISTINCT FROM NEW.staff_unread_count OR OLD.customer_last_read_at IS DISTINCT FROM NEW.customer_last_read_at OR OLD.staff_last_read_at IS DISTINCT FROM NEW.staff_last_read_at) THEN
    INSERT INTO realtime_outbox_events(aggregate_type, aggregate_id, event_name, payload) VALUES ('chat', NEW.id, 'chat.thread.read', compact);
  END IF; RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER chat_threads_realtime_outbox AFTER INSERT OR UPDATE ON chat_threads FOR EACH ROW EXECUTE FUNCTION enqueue_realtime_chat_thread_event();

CREATE OR REPLACE FUNCTION enqueue_realtime_chat_message_event() RETURNS trigger AS $$
DECLARE thread chat_threads; compact JSONB;
BEGIN
  SELECT * INTO thread FROM chat_threads WHERE id = NEW.thread_id;
  compact := jsonb_build_object('threadId', NEW.thread_id, 'message', jsonb_build_object('id', NEW.id, 'threadId', NEW.thread_id, 'senderType', NEW.sender_type, 'senderUserId', NEW.sender_user_id, 'senderStaffUserId', NEW.sender_staff_user_id, 'senderDeliverymanId', NEW.sender_deliveryman_id, 'body', left(NEW.body, 16000), 'createdAt', NEW.created_at), 'thread', compact_chat_thread(thread));
  INSERT INTO realtime_outbox_events(aggregate_type, aggregate_id, event_name, payload) VALUES ('chat', NEW.thread_id, 'chat.message.created', compact); RETURN NEW;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER chat_messages_realtime_outbox AFTER INSERT ON chat_messages FOR EACH ROW EXECUTE FUNCTION enqueue_realtime_chat_message_event();
