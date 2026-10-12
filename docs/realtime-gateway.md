# Isolated realtime gateway

The core API (`dist/src/main.js`, port 3000) does not install a Socket.IO adapter and does not accept Socket.IO connections. The independently deployable realtime process (`dist/src/realtime-main.js`, port 3001) owns `/orders-tracking` and `/chat`.

PostgreSQL order/chat triggers append compact versioned envelopes to `realtime_outbox_events` in the domain transaction. Rows are ordered by a `BIGSERIAL` id. A dispatcher that exists only in the realtime process holds a PostgreSQL session-level advisory lock on a dedicated connection, reads bounded ordered batches (50 rows), delivers each event to the Socket.IO gateways, and sets `published_at` only after delivery succeeds. A failed or crashed delivery leaves the row pending and it is replayed (at-least-once; `eventId` is the stable outbox id, so clients may deduplicate). The API process has no dispatcher. Redis is used only by the Socket.IO adapter; there is no Redis Stream.

## Client contracts

Namespaces and event names are unchanged. Orders use `order.tracking.subscribe`, `order.tracking.unsubscribe`, `order.admin.subscribe`, `order.created`, `order.status.updated`, `order.updated`, `order.tracking.updated`, and `order.tracking.snapshot`. Chat uses the existing `chat.*` commands and notifications.

JWTs continue through `auth.token` or `Authorization: Bearer`. The shared `CurrentSessionValidator` checks current database state before every inbound command on both namespaces; revoked, disabled, deleted, or scope-changed sessions are command-failed and disconnected. `chat.inbox.summary` is emitted after connect, explicit inbox subscription, and every delivered thread/message/read/status/assign mutation for the bounded affected scopes, using the exact legacy payload. Explicit order subscriptions retain their existing snapshot, e.g. `order.tracking.snapshot`.

## Delivery

Outbox rows carry only a compact intent (ids and scope). For each row the realtime process rebuilds the exact existing socket payload through the public `OrdersService.getRealtimeEventPayload` / `ChatService.getRealtimeEventPayload`: `order.created`, `order.status.updated` and `order.updated` keep their notification shapes, `order.tracking.updated` is the full tracking snapshot (identical to `order.tracking.snapshot`), and `chat.thread.created|updated`, `chat.message.created` and `chat.thread.read` keep the thread/message/read shapes. Contract tests pin these against the existing types. An order or thread proven deleted by current-state hydration is explicitly resolved as delivered; infrastructure errors fail delivery and keep the row retrying. Not reproduced: the optional `source` field of `order.created`, which was never persisted.

Authorization is evaluated per socket, keyed by socket id, actor type, role, uid, auth version and tenant/restaurant/branch/staff scope, so two sockets of one uid (a current and a revoked session) get independent decisions. For each event only sockets in that entity's rooms (`orders:tracking:<id>` or the tenant/restaurant/branch order rooms; `chat:thread:<id>` plus the customer, deliveryman, tenant, branch and global chat rooms) are fetched, never `server.fetchSockets()` globally. They are re-authorized against current database state in chunks of 250 (4 chunks in flight) at delivery time. Allowed sockets receive one copy. Sockets that fail only lose membership of the entity-specific room (`orders:tracking:<id>` / `chat:thread:<id>`); shared scope rooms and unrelated sockets are untouched and nothing is disconnected.

## Stable event ids, dedupe and replay

Every client payload (`order.created`, `order.status.updated`, `order.updated`, `order.tracking.updated`, `chat.thread.created|updated`, `chat.message.created`, `chat.thread.read`) carries an `eventId`: the decimal outbox row id as a string. It identifies an exact delivery duplicate only. It is **not** a commit-order, visibility-order, or high-water marker: a higher id can commit and emit before a lower id from another transaction. Clients must deduplicate with a bounded exact-ID LRU/set (for example the latest 1,024 IDs) and must never discard an unseen lower id merely because a higher id was observed. Reconnects still re-fetch current state.

## Retry and ordering

A failed delivery persists capped `attempts` telemetry and `last_error`, parks the entire order/thread, and retries forever with exponential backoff capped at 60 seconds. There is no automatic dead-letter cutoff: Redis, database, gateway, hydration, malformed-intent, and oversized-payload failures remain pending. Later events for that aggregate cannot overtake the failed row; other aggregates continue with bounded concurrency.

A deleted entity is the sole semantic obsolete case: delivery explicitly resolves that row as delivered after current-state hydration confirms the entity is absent. Malformed or oversized intents remain visible and make readiness fail.

`GET /ready` reports retrying aggregates and backlog age. Readiness fails while any aggregate is retrying, when the oldest pending row exceeds five minutes, or after repeated systemic dispatch/database failures. Published rows are retained for seven days.

## Readiness

`GET /ready` on port 3001 returns 200 only when all of these hold; otherwise 503 with the detail body:

- the dispatcher holds its dedicated PostgreSQL session and the advisory lease is verified in `pg_locks` within the last 10 s (a follower replica is ready while another session visibly holds the lease; nobody holding it is not ready);
- no aggregate is currently retrying, the oldest pending row is at most five minutes old, and fewer than 10 consecutive dispatch cycles failed systemically;
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
