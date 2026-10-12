-- Run in a transaction (psql -1) only after every outbox-capable API/realtime image is stopped
-- and the outbox is drained or intentionally archived. Not applied by `prisma migrate deploy`.

-- Objects of the unreleased first draft of this migration (combined triggers, payload function);
-- no-ops on databases that never applied it. Dropped first because they depend on the functions below.
DROP TRIGGER IF EXISTS orders_realtime_outbox ON orders;
DROP TRIGGER IF EXISTS chat_threads_realtime_outbox ON chat_threads;

DROP TRIGGER IF EXISTS chat_messages_realtime_outbox ON chat_messages;
DROP FUNCTION IF EXISTS enqueue_realtime_chat_message_event();
DROP TRIGGER IF EXISTS chat_threads_realtime_outbox_update ON chat_threads;
DROP TRIGGER IF EXISTS chat_threads_realtime_outbox_insert ON chat_threads;
DROP FUNCTION IF EXISTS enqueue_realtime_chat_thread_event();
DROP FUNCTION IF EXISTS compact_chat_thread(chat_threads);
DROP TRIGGER IF EXISTS orders_realtime_outbox_update ON orders;
DROP TRIGGER IF EXISTS orders_realtime_outbox_insert ON orders;
DROP FUNCTION IF EXISTS enqueue_realtime_order_event();
DROP TRIGGER IF EXISTS deliverymen_realtime_outbox_location ON deliverymen;
DROP FUNCTION IF EXISTS enqueue_realtime_deliveryman_tracking_events();
DROP TABLE IF EXISTS realtime_outbox_events;
