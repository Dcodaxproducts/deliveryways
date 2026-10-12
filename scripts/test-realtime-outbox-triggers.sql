-- Behavioural proof of the realtime outbox triggers. Run by scripts/test-realtime-outbox-migration.sh
-- against a DISPOSABLE scratch database only (it deletes every orders/chat/outbox row).
--
-- Parent rows are not created: session_replication_role = replica skips foreign-key checks, and the
-- outbox triggers are switched to ENABLE ALWAYS so they still fire. Each statement below is its own
-- transaction, so "same transaction" behaviour is exercised explicitly with BEGIN/COMMIT.
\set ON_ERROR_STOP on
SET session_replication_role = replica;

ALTER TABLE orders ENABLE ALWAYS TRIGGER orders_realtime_outbox_insert;
ALTER TABLE orders ENABLE ALWAYS TRIGGER orders_realtime_outbox_update;
ALTER TABLE deliverymen ENABLE ALWAYS TRIGGER deliverymen_realtime_outbox_location;
ALTER TABLE chat_threads ENABLE ALWAYS TRIGGER chat_threads_realtime_outbox_insert;
ALTER TABLE chat_threads ENABLE ALWAYS TRIGGER chat_threads_realtime_outbox_update;
ALTER TABLE chat_messages ENABLE ALWAYS TRIGGER chat_messages_realtime_outbox;

DELETE FROM chat_messages;
DELETE FROM chat_threads;
DELETE FROM orders;
DELETE FROM deliverymen;
DELETE FROM realtime_outbox_events;

CREATE TEMP TABLE outbox_probe (last_id BIGINT NOT NULL);
INSERT INTO outbox_probe VALUES (0);

-- Asserts the events enqueued since the previous call, in BIGSERIAL id order, then consumes them.
-- Also asserts every payload is a compact intent (only id/threadId/message.id keys, tiny, no body).
CREATE FUNCTION pg_temp.expect(label TEXT, expected TEXT) RETURNS void AS $$
DECLARE actual TEXT; previous BIGINT; newest BIGINT; bad INT;
BEGIN
  SELECT last_id INTO previous FROM outbox_probe;
  SELECT COALESCE(string_agg(event_name, ',' ORDER BY id), ''), COALESCE(max(id), previous)
    INTO actual, newest FROM realtime_outbox_events;
  IF actual IS DISTINCT FROM expected THEN
    RAISE EXCEPTION '[%] expected events "%" but got "%"', label, expected, actual;
  END IF;
  IF EXISTS (SELECT 1 FROM realtime_outbox_events WHERE id <= previous) THEN
    RAISE EXCEPTION '[%] BIGSERIAL id did not increase monotonically across statements', label;
  END IF;
  SELECT count(*) INTO bad FROM realtime_outbox_events e
   WHERE octet_length(e.payload::text) > 120
      OR EXISTS (SELECT 1 FROM jsonb_object_keys(e.payload) k WHERE k NOT IN ('id', 'threadId', 'message'))
      OR (e.payload ? 'message' AND e.payload->'message' <> jsonb_build_object('id', e.payload#>>'{message,id}'))
      OR e.payload::text LIKE '%SECRET-BODY%';
  IF bad > 0 THEN
    RAISE EXCEPTION '[%] % outbox payload(s) are not compact intents', label, bad;
  END IF;
  UPDATE outbox_probe SET last_id = newest;
  DELETE FROM realtime_outbox_events;
  RAISE NOTICE 'ok: % -> %', label, CASE WHEN expected = '' THEN '(nothing)' ELSE expected END;
END; $$ LANGUAGE plpgsql;

-- Orders ---------------------------------------------------------------------------------------
INSERT INTO orders (id, tenant_id, restaurant_id, branch_id, customer_id, order_type, payment_method, status, subtotal, total_amount, updated_at)
VALUES ('o1', 't1', 'r1', 'b1', 'c1', 'DELIVERY', 'COD', 'PLACED', 10, 10, now());
SELECT pg_temp.expect('order inserted as PLACED', 'order.created,order.tracking.updated');

INSERT INTO orders (id, tenant_id, restaurant_id, branch_id, customer_id, order_type, payment_method, status, subtotal, total_amount, updated_at)
VALUES ('o2', 't1', 'r1', 'b1', 'c1', 'DELIVERY', 'STRIPE', 'PAYMENT_PENDING', 10, 10, now());
SELECT pg_temp.expect('PAYMENT_PENDING insert is not announced', '');

UPDATE orders SET updated_at = now() + interval '1 second' WHERE id = 'o1';
SELECT pg_temp.expect('updated_at-only touch is a no-op', '');
UPDATE orders SET status = status, payment_status = payment_status WHERE id = 'o1';
SELECT pg_temp.expect('identity update is a no-op', '');
UPDATE orders SET subtotal = 99, total_amount = 99, tip_amount = 5, delivery_fee = 3, delivery_otp = '1234' WHERE id = 'o1';
SELECT pg_temp.expect('totals/fees/otp are not realtime-visible', '');

UPDATE orders SET status = 'CONFIRMED' WHERE id = 'o1';
SELECT pg_temp.expect('status change', 'order.status.updated,order.tracking.updated');
UPDATE orders SET payment_status = 'PAID' WHERE id = 'o1';
SELECT pg_temp.expect('payment status change', 'order.updated,order.tracking.updated');
UPDATE orders SET deliveryman_id = 'd1', assigned_at = now() WHERE id = 'o1';
SELECT pg_temp.expect('deliveryman assignment is tracking-only', 'order.tracking.updated');
UPDATE orders SET status = 'PREPARING', payment_status = 'REFUNDED' WHERE id = 'o1';
SELECT pg_temp.expect('status + payment in one write', 'order.status.updated,order.updated,order.tracking.updated');

UPDATE orders SET status = 'PLACED' WHERE id = 'o2';
SELECT pg_temp.expect('PAYMENT_PENDING -> PLACED announces the order', 'order.created,order.status.updated,order.tracking.updated');

-- Deliveryman location --------------------------------------------------------------------------
INSERT INTO deliverymen (id, tenant_id, restaurant_id, branch_id, first_name, last_name, email, phone, updated_at)
VALUES ('d1', 't1', 'r1', 'b1', 'Driver', 'One', 'driver@example.test', '+490001', now());
UPDATE orders SET deliveryman_id = 'd1', status = 'OUT_FOR_DELIVERY' WHERE id = 'o1';
SELECT pg_temp.expect('order becomes actively tracked', 'order.status.updated,order.tracking.updated');
UPDATE deliverymen SET current_lat = 52.5200000, current_lng = 13.4050000, location_updated_at = now() WHERE id = 'd1';
SELECT pg_temp.expect('deliveryman location refreshes active tracking orders', 'order.tracking.updated');
UPDATE deliverymen SET updated_at = now() + interval '1 second' WHERE id = 'd1';
SELECT pg_temp.expect('deliveryman updated_at-only touch is a no-op', '');

-- Chat -------------------------------------------------------------------------------------------
BEGIN;
INSERT INTO chat_threads (id, tenant_id, restaurant_id, customer_id, status, last_message_at, customer_unread_count, staff_unread_count, customer_last_read_at, last_message_preview, updated_at)
VALUES ('th1', 't1', 'r1', 'c1', 'OPEN', now(), 0, 1, now(), 'SECRET-BODY first', now());
INSERT INTO chat_messages (id, thread_id, sender_type, body) VALUES ('m1', 'th1', 'CUSTOMER', 'SECRET-BODY first');
COMMIT;
SELECT pg_temp.expect('thread + first message in one transaction', 'chat.thread.created');

BEGIN;
INSERT INTO chat_messages (id, thread_id, sender_type, body) VALUES ('m2', 'th1', 'ADMIN', 'SECRET-BODY reply');
UPDATE chat_threads SET last_message_at = now() + interval '1 minute', last_message_preview = 'SECRET-BODY reply',
  customer_unread_count = customer_unread_count + 1, staff_unread_count = 0, staff_last_read_at = now(), status = 'IN_PROGRESS'
 WHERE id = 'th1';
COMMIT;
SELECT pg_temp.expect('later message: message then thread update, no read event', 'chat.message.created,chat.thread.updated');

UPDATE chat_threads SET customer_unread_count = 0, customer_last_read_at = now() + interval '2 minutes' WHERE id = 'th1';
SELECT pg_temp.expect('mark read', 'chat.thread.updated,chat.thread.read');
UPDATE chat_threads SET updated_at = now() + interval '3 minutes' WHERE id = 'th1';
SELECT pg_temp.expect('thread updated_at-only touch is a no-op', '');
UPDATE chat_threads SET subject = subject, status = status WHERE id = 'th1';
SELECT pg_temp.expect('thread identity update is a no-op', '');
UPDATE chat_threads SET status = 'RESOLVED', resolved_at = now() WHERE id = 'th1';
SELECT pg_temp.expect('thread status change', 'chat.thread.updated');
UPDATE chat_threads SET assigned_staff_user_id = 's1' WHERE id = 'th1';
SELECT pg_temp.expect('thread assignment', 'chat.thread.updated');

-- Intent payload shape is exact, not just compact.
INSERT INTO chat_messages (id, thread_id, sender_type, body) VALUES ('m3', 'th1', 'CUSTOMER', 'SECRET-BODY third');
DO $$ BEGIN
  IF (SELECT payload FROM realtime_outbox_events) IS DISTINCT FROM '{"threadId": "th1", "message": {"id": "m3"}}'::jsonb THEN
    RAISE EXCEPTION 'message intent payload mismatch: %', (SELECT payload FROM realtime_outbox_events);
  END IF;
END $$;
SELECT pg_temp.expect('message intent payload', 'chat.message.created');
INSERT INTO orders (id, tenant_id, restaurant_id, branch_id, customer_id, order_type, payment_method, status, subtotal, total_amount, updated_at)
VALUES ('o3', 't1', 'r1', 'b1', 'c1', 'TAKEAWAY', 'COD', 'PLACED', 1, 1, now());
DO $$ BEGIN
  IF (SELECT count(*) FROM realtime_outbox_events WHERE payload <> '{"id": "o3"}'::jsonb) <> 0 THEN
    RAISE EXCEPTION 'order intent payload mismatch';
  END IF;
END $$;
SELECT pg_temp.expect('order intent payload', 'order.created,order.tracking.updated');

-- Deleting domain rows never enqueues anything.
DELETE FROM chat_messages;
DELETE FROM chat_threads;
DELETE FROM orders;
DELETE FROM deliverymen;
SELECT pg_temp.expect('deletes enqueue nothing', '');

-- Leave the triggers in their normal origin-mode state.
ALTER TABLE orders ENABLE TRIGGER orders_realtime_outbox_insert;
ALTER TABLE orders ENABLE TRIGGER orders_realtime_outbox_update;
ALTER TABLE deliverymen ENABLE TRIGGER deliverymen_realtime_outbox_location;
ALTER TABLE chat_threads ENABLE TRIGGER chat_threads_realtime_outbox_insert;
ALTER TABLE chat_threads ENABLE TRIGGER chat_threads_realtime_outbox_update;
ALTER TABLE chat_messages ENABLE TRIGGER chat_messages_realtime_outbox;
