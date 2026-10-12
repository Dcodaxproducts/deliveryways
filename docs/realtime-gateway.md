# Isolated realtime gateway

The core API (`dist/src/main.js`, port 3000) does not install a Socket.IO adapter and does not accept Socket.IO connections. The independently deployable realtime process (`dist/src/realtime-main.js`, port 3001) owns `/orders-tracking` and `/chat`.

PostgreSQL order/chat triggers append compact versioned envelopes to `realtime_outbox_events` in the domain transaction. Rows are ordered by a `BIGSERIAL` id. A dispatcher that exists only in the realtime process holds a PostgreSQL session-level advisory lock on a dedicated connection, reads bounded ordered batches (50 rows), delivers each event to the Socket.IO gateways, and sets `published_at` only after delivery succeeds. A failed or crashed delivery leaves the row pending and it is replayed (at-least-once; `eventId` is the stable outbox id, so clients may deduplicate). The API process has no dispatcher. Redis is used only by the Socket.IO adapter; there is no Redis Stream.

## Client contracts

Namespaces and event names are unchanged. Orders use `order.tracking.subscribe`, `order.tracking.unsubscribe`, `order.admin.subscribe`, `order.created`, `order.status.updated`, `order.updated`, `order.tracking.updated`, and `order.tracking.snapshot`. Chat uses the existing `chat.*` commands and notifications.

JWTs continue through `auth.token` or `Authorization: Bearer`. `/chat` emits `chat.inbox.summary` after connect and again on every explicit `chat.inbox.subscribe` (a summary failure on connect is logged and does not drop the socket). Explicit subscribe/join commands retain authorization checks and may return their existing snapshot, e.g. `order.tracking.snapshot`.

## Delivery

Outbox rows carry only a compact intent (ids and scope). For each row the realtime process rebuilds the exact existing socket payload through the public `OrdersService.getRealtimeEventPayload` / `ChatService.getRealtimeEventPayload`: `order.created`, `order.status.updated` and `order.updated` keep their notification shapes, `order.tracking.updated` is the full tracking snapshot (identical to `order.tracking.snapshot`), and `chat.thread.created|updated`, `chat.message.created` and `chat.thread.read` keep the thread/message/read shapes. Contract tests pin these against the existing types. An order or thread that no longer exists is dropped; infrastructure errors fail the delivery and the row is retried. Not reproduced: the optional `source` field of `order.created`, which was never persisted.

Authorization is evaluated per socket, keyed by socket id, actor type, role, uid, auth version and tenant/restaurant/branch/staff scope, so two sockets of one uid (a current and a revoked session) get independent decisions. For each event only sockets in that entity's rooms (`orders:tracking:<id>` or the tenant/restaurant/branch order rooms; `chat:thread:<id>` plus the customer, deliveryman, tenant, branch and global chat rooms) are fetched, never `server.fetchSockets()` globally. They are re-authorized against current database state in chunks of 250 (4 chunks in flight) at delivery time. Allowed sockets receive one copy. Sockets that fail only lose membership of the entity-specific room (`orders:tracking:<id>` / `chat:thread:<id>`); shared scope rooms and unrelated sockets are untouched and nothing is disconnected.

## Stable event ids, dedupe and replay

Every client payload (`order.created`, `order.status.updated`, `order.updated`, `order.tracking.updated`, `chat.thread.created|updated`, `chat.message.created`, `chat.thread.read`) carries one additional field, `eventId`: the decimal outbox row id as a string. All existing fields and event names are unchanged; `order.tracking.snapshot` and `chat.inbox.summary` (replies to explicit commands) have no `eventId`. Delivery is at-least-once: after a dispatcher crash the unmarked rows are re-emitted with the **same** `eventId` (the payload is rebuilt from current state, so a replay may carry newer data). Ids increase per aggregate (an order or a chat thread), but events of different aggregates are delivered concurrently, so there is no global order. Clients should therefore drop an event whose `eventId` is not greater than the last one applied for the same aggregate (compare as `BigInt`), or keep a bounded set of recent ids. After a reconnect clients re-fetch current state over HTTP/`order.tracking.subscribe`; ids let them discard replayed duplicates that arrive afterwards.

## Retry, dead letter and ordering

A failed delivery persists `attempts` and `last_error` before anything else and parks that order/thread (the whole aggregate, so a later event never overtakes it) with an in-memory exponential backoff of 1 s, 2 s, 4 s ... capped at 60 s; other aggregates keep flowing and parked aggregates are excluded from the batch query so they cannot starve it. The 12th failed attempt (about 6 minutes of retries) dead-letters the row: `failed_at` is set, it is never retried automatically, and the aggregate's later events proceed in order. Rows over 64 KiB are dead-lettered immediately. The attempt count lives in PostgreSQL, so a restart or leader change does not reset the budget (backoff restarts, which is safe). If a failed attempt cannot be persisted the session is dropped rather than retrying unbounded.

`GET /ready` exposes `outbox.deadLetter` (`total` of rows with `failed_at` in PostgreSQL, `sinceStart`, the `last` poison row with id/event/aggregate/attempts/error, and an `action` hint), `outbox.retrying` (aggregates currently backing off) and `outbox.backlog` (pending count and oldest pending row, refreshed every 5 s). Dead letters do not fail readiness, but each logs at `error` level; alert on `deadLetter.total > 0`. Resolve with:

```sql
SELECT id, event_name, aggregate_id, attempts, last_error FROM realtime_outbox_events WHERE failed_at IS NOT NULL ORDER BY id;
-- after fixing the cause, requeue (the dispatcher picks it up on its next cycle):
UPDATE realtime_outbox_events SET failed_at = NULL, attempts = 0 WHERE id = <id>;
```

Dead-lettered rows are kept until resolved (published rows are deleted after 7 days). Outages longer than the retry window (database or Redis down for more than about 6 minutes while events are pending) dead-letter the pending rows; requeue them after recovery.

## Readiness

`GET /ready` on port 3001 returns 200 only when all of these hold; otherwise 503 with the detail body:

- the dispatcher holds its dedicated PostgreSQL session and the advisory lease is verified in `pg_locks` within the last 10 s (a follower replica is ready while another session visibly holds the lease; nobody holding it is not ready);
- fewer than 10 consecutive dispatch cycles failed systemically (database errors, or at least two aggregates failing in a cycle with no delivery at all; cycles spent waiting out retry backoff during such a failure count; any delivered event or an idle cycle resets the count). A single poison order/thread never fails readiness; it is retried a bounded number of times and then dead-lettered (see below);
- both Socket.IO Redis adapter clients (pub and sub) report ready. The adapter registers itself during bootstrap; until then `/ready` fails closed.

## Deployment

1. Build the `production` and `realtime` Docker targets from the same SHA.
2. Start Redis and verify availability.
3. Start API; verify `/api/v1/health/live`.
4. Start realtime with `REDIS_URL` (Socket.IO adapter), `JWT_ACCESS_SECRET`, and `DATABASE_URL`; verify port 3001 `/health` and `/ready`. Run more than one replica freely: only the advisory-lock holder dispatches.
5. Route only Socket.IO traffic to port 3001; keep API HTTP on port 3000.
6. Run `npm run test:realtime-isolation` outside production.

## Rollback

Remove realtime ingress, stop realtime, and roll API and realtime images back together to the previous known-good SHA. Outbox rows stay in PostgreSQL, so undelivered events replay when a gateway returns; see the durable rollout runbook for database rollback. Do not point Socket.IO traffic to the new core API; it intentionally has no Socket.IO server.
