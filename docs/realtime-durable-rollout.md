# Durable realtime rollout and rollback

## Invariants

- PostgreSQL triggers write compact (<=64 KiB) outbox rows in the same transaction as order/chat changes. Redis is transport, never the source of truth.
- The dispatcher uses one PostgreSQL advisory lock, batches 50 rows, and appends to a capped 100,000-record Redis Stream. The gateway consumer group processes at most 100 records per poll, 16 aggregate keys concurrently, serially per order/thread, with event-ID deduplication and a capped dead-letter stream.
- Every delivery batch re-reads current accounts plus the order/thread in four bounded queries, so stale room membership cannot survive reassignment, ownership, role/scope, assignment, or session-version changes.

## Rollout (mandatory order)

1. Back up PostgreSQL. Apply migration `20261013003000_add_realtime_transactional_outbox`. Deploy API publisher/outbox image while the gateway remains off and polling clients remain unchanged. Verify committed writes create pending outbox rows; Redis outage must not fail API commits.
2. Start the realtime gateway. Verify backlog reaches the stream, outbox rows receive `published_at`, consumer pending count returns to zero, and `:dead` remains empty. Keep socket routing disabled externally.
3. Enable sockets only for the new client image. Keep current polling client images deployable as the immediate client rollback.

## Rollback

- Client/gateway rollback is safe: disable socket routing/gateway; polling clients continue and outbox rows accumulate/replay.
- Do **not** roll the API back to a pre-outbox publisher while writes continue. First disable socket rollout and keep at least one outbox-capable dispatcher image running. An old API may coexist only while the triggers remain installed; triggers preserve events independently of application code.
- Roll back the database only after all outbox-capable APIs/gateways are stopped, the outbox is drained or intentionally archived, and polling-only operation is confirmed. Run `rollback.sql` in a transaction after a fresh backup.

## Scratch proof

Run `scripts/test-realtime-outbox-migration.sh` against a disposable PostgreSQL database. It applies all migrations, checks triggers/outbox, runs rollback SQL, and reapplies the migration. Never point it at shared/production databases.
