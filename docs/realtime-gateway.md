# Isolated realtime gateway

The core API (`dist/src/main.js`, port 3000) does not install a Socket.IO adapter and does not accept Socket.IO connections. The independently deployable realtime process (`dist/src/realtime-main.js`, port 3001) owns `/orders-tracking` and `/chat`.

PostgreSQL order/chat triggers append compact versioned envelopes to `realtime_outbox_events` in the domain transaction. A bounded dispatcher replays rows to the capped `deliveryways:realtime:v2` Redis Stream. The gateway consumer group acknowledges after delivery, retries pending records, deduplicates stable event IDs, and dead-letters poison records. Redis outages never reject committed writes.

## Client contracts

Namespaces and event names are unchanged. Orders use `order.tracking.subscribe`, `order.tracking.unsubscribe`, `order.admin.subscribe`, `order.created`, `order.status.updated`, `order.updated`, `order.tracking.updated`, and `order.tracking.snapshot`. Chat uses the existing `chat.*` commands and notifications.

JWTs continue through `auth.token` or `Authorization: Bearer`. No database snapshot is loaded at connection time. Explicit subscribe/join commands retain authorization checks and may return their existing snapshot.

## Deployment

1. Build the `production` and `realtime` Docker targets from the same SHA.
2. Start Redis and verify availability.
3. Start API with `REDIS_URL`; verify `/api/v1/health/live`.
4. Start realtime with the same `REDIS_URL`, `JWT_ACCESS_SECRET`, and `DATABASE_URL`; verify port 3001 `/health` and `/ready`.
5. Route only Socket.IO traffic to port 3001; keep API HTTP on port 3000.
6. Run `npm run test:realtime-isolation` outside production.

## Rollback

Remove realtime ingress, stop realtime, and roll API and realtime images back together to the previous known-good SHA. Redis events are ephemeral, so no schema/data rollback is needed. Do not point Socket.IO traffic to the new core API; it intentionally has no Socket.IO server.
