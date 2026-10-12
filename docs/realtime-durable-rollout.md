# Durable realtime rollout and rollback

## Invariants

- PostgreSQL triggers write compact (<=64 KiB) outbox rows (`BIGSERIAL` id) in the same transaction as order/chat changes. Deliveryman location writes also enqueue tracking intents for that driver's active deliveries in the same transaction. UPDATE triggers have a `WHEN` clause over realtime-visible fields, so no-op updates (e.g. `updated_at` only) enqueue nothing. There is no Redis Stream.
- Only the isolated realtime process runs the dispatcher. It holds a session-level `pg_try_advisory_lock` on a dedicated connection (released by PostgreSQL if the connection dies), reads 50-row batches ordered by id, delivers up to 8 order/thread aggregates concurrently (serially within one aggregate), and marks `published_at` only after delivery succeeds. A failed delivery keeps that row and later rows of the same order/thread pending; a crash replays unmarked rows. Delivery is at-least-once with a stable `eventId`.
- Published rows are deleted after 7 days. Failed delivery is retried indefinitely with persisted attempts/error telemetry and per-aggregate exponential backoff capped at 60 seconds; there is no dead-letter cutoff. Oversized or malformed intents stay pending and fail readiness. A current-state lookup that proves an entity was deleted explicitly resolves the obsolete row as delivered. Client `eventId` values are duplicate identities only; clients use a bounded exact-ID LRU/set, never a numeric high-water mark.
- Every event rebuilds its full payload from current state, resolves the order/thread once, and re-reads current accounts per bounded chunk of sockets from that entity's rooms only, so stale entity-room membership cannot survive reassignment, ownership, role/scope, assignment, or session-version changes. Failed sockets lose only the entity room and are never disconnected.

## Rollout (mandatory order)

1. Back up PostgreSQL. Apply migration `20261013003000_add_realtime_transactional_outbox`. Deploy the API image while the gateway remains off and polling clients remain unchanged. Verify committed writes create pending outbox rows.
2. Start the realtime gateway. Verify `/ready` is 200 on every replica, `outbox.leader` is true on exactly one, `adapter.pubReady`/`subReady` are true, the backlog drains, and rows receive `published_at`. Keep socket routing disabled externally.
3. Enable sockets only for the new client image. Keep current polling client images deployable as the immediate client rollback.

## Rollback

- Client/gateway rollback is safe: disable socket routing/gateway; polling clients continue and outbox rows accumulate/replay.
- Do **not** roll the API back to a pre-outbox publisher while writes continue. First disable socket rollout and keep at least one realtime (dispatcher) image running. An old API may coexist only while the triggers remain installed; triggers preserve events independently of application code.
- Roll back the database only after all outbox-capable APIs/gateways are stopped, the outbox is drained or intentionally archived, and polling-only operation is confirmed. Run `rollback.sql` in a transaction after a fresh backup.

## Scratch proof

Run `scripts/test-realtime-outbox-migration.sh` against a disposable PostgreSQL database. It applies all migrations, checks triggers/outbox, runs rollback SQL, and reapplies the migration. Never point it at shared/production databases.
