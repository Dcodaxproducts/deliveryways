-- Transactional outbox for the isolated realtime gateway.
--
-- Rows are compact INTENTS, never socket payloads: only the aggregate id (and, for
-- chat messages, the message id) is stored. The realtime process rebuilds the exact
-- socket payload from current database state at delivery time, so stale or oversized
-- data can never be replayed to clients.
--
-- Ordering is by the BIGSERIAL id; rows are drained by the single advisory-lock-fenced
-- dispatcher in the realtime process (see RealtimeOutboxDispatcherService).
CREATE TABLE "realtime_outbox_events" (
  "id" BIGSERIAL NOT NULL,
  "aggregate_type" VARCHAR(40) NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "event_name" VARCHAR(80) NOT NULL,
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "published_at" TIMESTAMPTZ,
  "failed_at" TIMESTAMPTZ,
  "last_error" VARCHAR(1000),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "realtime_outbox_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "realtime_outbox_dispatch_idx" ON "realtime_outbox_events" ("published_at", "failed_at", "id");

-- Orders ---------------------------------------------------------------------------------
-- Events mirror the legacy application emit points:
--   order.created         order becomes PLACED (inserted as PLACED, or PAYMENT_PENDING -> PLACED)
--   order.status.updated  status changed
--   order.updated         payment status changed
--   order.tracking.updated any change to a column exposed by the tracking snapshot
-- INSERT and UPDATE are separate triggers so the UPDATE trigger carries a WHEN guard over
-- the meaningful columns: updated_at-only touches, totals, fees, OTP and similar writes
-- enqueue nothing. Intent payload: {"id": <order id>}.
CREATE FUNCTION enqueue_realtime_order_event() RETURNS trigger AS $$
DECLARE intent JSONB := jsonb_build_object('id', NEW.id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO realtime_outbox_events (aggregate_type, aggregate_id, event_name, payload)
    VALUES ('order', NEW.id, 'order.created', intent),
           ('order', NEW.id, 'order.tracking.updated', intent);
    RETURN NULL;
  END IF;

  IF OLD.status = 'PAYMENT_PENDING' AND NEW.status = 'PLACED' THEN
    INSERT INTO realtime_outbox_events (aggregate_type, aggregate_id, event_name, payload)
    VALUES ('order', NEW.id, 'order.created', intent);
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO realtime_outbox_events (aggregate_type, aggregate_id, event_name, payload)
    VALUES ('order', NEW.id, 'order.status.updated', intent);
  END IF;
  IF OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
    INSERT INTO realtime_outbox_events (aggregate_type, aggregate_id, event_name, payload)
    VALUES ('order', NEW.id, 'order.updated', intent);
  END IF;
  INSERT INTO realtime_outbox_events (aggregate_type, aggregate_id, event_name, payload)
  VALUES ('order', NEW.id, 'order.tracking.updated', intent);
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

-- Orders that are not yet PLACED (e.g. PAYMENT_PENDING online checkout) are not announced.
CREATE TRIGGER orders_realtime_outbox_insert AFTER INSERT ON orders
  FOR EACH ROW WHEN (NEW.status = 'PLACED')
  EXECUTE FUNCTION enqueue_realtime_order_event();
CREATE TRIGGER orders_realtime_outbox_update AFTER UPDATE ON orders
  FOR EACH ROW
  WHEN ((OLD.customer_id, OLD.deliveryman_id, OLD.delivery_address_id, OLD.order_type, OLD.payment_method,
         OLD.payment_status, OLD.order_time, OLD.is_scheduled, OLD.status, OLD.assigned_at,
         OLD.delivered_at, OLD.paid_at, OLD.cancelled_at, OLD.customer_note)
        IS DISTINCT FROM
        (NEW.customer_id, NEW.deliveryman_id, NEW.delivery_address_id, NEW.order_type, NEW.payment_method,
         NEW.payment_status, NEW.order_time, NEW.is_scheduled, NEW.status, NEW.assigned_at,
         NEW.delivered_at, NEW.paid_at, NEW.cancelled_at, NEW.customer_note))
  EXECUTE FUNCTION enqueue_realtime_order_event();

-- Deliveryman location updates historically refreshed every active tracking socket. Keep
-- that behavior transactional too: the location write and all affected compact order
-- intents commit (or roll back) together. Identity/no-op updates enqueue nothing.
CREATE FUNCTION enqueue_realtime_deliveryman_tracking_events() RETURNS trigger AS $$
BEGIN
  INSERT INTO realtime_outbox_events (aggregate_type, aggregate_id, event_name, payload)
  SELECT 'order', id, 'order.tracking.updated', jsonb_build_object('id', id)
  FROM orders
  WHERE deliveryman_id = NEW.id AND status = 'OUT_FOR_DELIVERY'
  ORDER BY id;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER deliverymen_realtime_outbox_location AFTER UPDATE ON deliverymen
  FOR EACH ROW
  WHEN ((OLD.current_lat, OLD.current_lng, OLD.location_updated_at)
        IS DISTINCT FROM
        (NEW.current_lat, NEW.current_lng, NEW.location_updated_at))
  EXECUTE FUNCTION enqueue_realtime_deliveryman_tracking_events();

-- Chat threads -----------------------------------------------------------------------------
--   chat.thread.created  thread inserted
--   chat.thread.updated  any column exposed by the thread payload changed
--   chat.thread.read     read markers/unread counters changed WITHOUT a new message
--                        (sending a message already emits chat.message.created + thread.updated)
-- Intent payload: {"threadId": <thread id>}.
CREATE FUNCTION enqueue_realtime_chat_thread_event() RETURNS trigger AS $$
DECLARE intent JSONB := jsonb_build_object('threadId', NEW.id);
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO realtime_outbox_events (aggregate_type, aggregate_id, event_name, payload)
    VALUES ('chat', NEW.id, 'chat.thread.created', intent);
    RETURN NULL;
  END IF;

  INSERT INTO realtime_outbox_events (aggregate_type, aggregate_id, event_name, payload)
  VALUES ('chat', NEW.id, 'chat.thread.updated', intent);
  IF OLD.last_message_at IS NOT DISTINCT FROM NEW.last_message_at
     AND (OLD.customer_unread_count, OLD.staff_unread_count, OLD.customer_last_read_at, OLD.staff_last_read_at)
         IS DISTINCT FROM
         (NEW.customer_unread_count, NEW.staff_unread_count, NEW.customer_last_read_at, NEW.staff_last_read_at) THEN
    INSERT INTO realtime_outbox_events (aggregate_type, aggregate_id, event_name, payload)
    VALUES ('chat', NEW.id, 'chat.thread.read', intent);
  END IF;
  RETURN NULL;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER chat_threads_realtime_outbox_insert AFTER INSERT ON chat_threads
  FOR EACH ROW EXECUTE FUNCTION enqueue_realtime_chat_thread_event();
CREATE TRIGGER chat_threads_realtime_outbox_update AFTER UPDATE ON chat_threads
  FOR EACH ROW
  WHEN ((OLD.customer_id, OLD.order_id, OLD.deliveryman_id, OLD.source, OLD.subject, OLD.status,
         OLD.assigned_staff_user_id, OLD.last_message_preview, OLD.last_message_at,
         OLD.customer_unread_count, OLD.staff_unread_count, OLD.customer_last_read_at,
         OLD.staff_last_read_at, OLD.resolved_at)
        IS DISTINCT FROM
        (NEW.customer_id, NEW.order_id, NEW.deliveryman_id, NEW.source, NEW.subject, NEW.status,
         NEW.assigned_staff_user_id, NEW.last_message_preview, NEW.last_message_at,
         NEW.customer_unread_count, NEW.staff_unread_count, NEW.customer_last_read_at,
         NEW.staff_last_read_at, NEW.resolved_at))
  EXECUTE FUNCTION enqueue_realtime_chat_thread_event();

-- Chat messages ----------------------------------------------------------------------------
-- Intent payload: {"threadId": <thread id>, "message": {"id": <message id>}}; the body is
-- never copied. The first message of a thread is already carried by the thread payload that
-- chat.thread.created rebuilds, so it is not announced separately (legacy behaviour).
-- created_at defaults to the transaction start time, so equality identifies rows written
-- by this same transaction.
CREATE FUNCTION enqueue_realtime_chat_message_event() RETURNS trigger AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM realtime_outbox_events
    WHERE aggregate_type = 'chat' AND aggregate_id = NEW.thread_id
      AND event_name = 'chat.thread.created' AND created_at = CURRENT_TIMESTAMP
  ) THEN
    RETURN NULL;
  END IF;
  INSERT INTO realtime_outbox_events (aggregate_type, aggregate_id, event_name, payload)
  VALUES ('chat', NEW.thread_id, 'chat.message.created',
          jsonb_build_object('threadId', NEW.thread_id, 'message', jsonb_build_object('id', NEW.id)));
  RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE TRIGGER chat_messages_realtime_outbox AFTER INSERT ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION enqueue_realtime_chat_message_event();
