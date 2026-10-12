DROP TRIGGER IF EXISTS chat_messages_realtime_outbox ON chat_messages;
DROP FUNCTION IF EXISTS enqueue_realtime_chat_message_event();
DROP TRIGGER IF EXISTS chat_threads_realtime_outbox ON chat_threads;
DROP FUNCTION IF EXISTS enqueue_realtime_chat_thread_event();
DROP FUNCTION IF EXISTS compact_chat_thread(chat_threads);
DROP TRIGGER IF EXISTS orders_realtime_outbox ON orders;
DROP FUNCTION IF EXISTS enqueue_realtime_order_event();
DROP TABLE IF EXISTS realtime_outbox_events;
