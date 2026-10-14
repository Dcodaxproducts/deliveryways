# Financial ledger and payout-integrity rollout

## Expand (online-safe)

1. Apply Prisma migrations. Migrations `20261014190000` and `20261014193000` are metadata-only: they add nullable columns/types and a new empty outbox table. They perform no historical `UPDATE` and build no index on a populated hot table.
2. Deploy the application. New gift-card emails use a durable effect with a lease/fencing token and deterministic RFC Message-ID. New refunds always receive a lifecycle and provider idempotency key. Legacy refund rows whose lifecycle is still NULL are quarantined by runtime and can only reconcile.

## Bounded backfills

Each script locks at most `batch_size` rows with `FOR UPDATE SKIP LOCKED`, commits once, and reports a cursor. Repeat a cursor pass until `scanned=0`; restart without a cursor after manual reconciliation to revisit previously ambiguous rows.

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v batch_size=500 -f scripts/backfill-financial-ledger-identities.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v batch_size=500 -f scripts/backfill-gift-card-source-payments.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v batch_size=500 -f scripts/backfill-refund-source-links.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v batch_size=500 -f scripts/backfill-refund-lifecycle.sql
```

Pass `-v after_id='<next_cursor>'` for the gift-card/refund scripts. Never run an unbounded historical update during deploy.

## Audit and indexes

1. Run `scripts/audit-payout-integrity-rollout.sql`. Resolve every non-zero duplicate count. NULL/unlinked counts may remain only while the corresponding backfill is still running; runtime keeps those rows quarantined.
2. From `psql` with no surrounding transaction, run `scripts/create-payout-integrity-indexes-concurrently.sql`. It creates the coupon source and provider idempotency unique indexes with `CONCURRENTLY`, plus the refund recovery index.
3. Rerun the audit and verify the expected indexes are valid in `pg_index`.

## Gift-card email delivery semantics

The payment/card/outbox effect commit atomically. A worker locks the effect, acquires a 60-second lease, sends outside the database transaction, and completes only with the same fencing token. Concurrent webhooks therefore produce one logical effect. A crash after SMTP acceptance but before local completion can require one controlled retry after lease expiry; every retry carries the same deterministic Message-ID (`<gift-card-<payment-id>@feastflow.app>`) so providers that deduplicate Message-ID do not redeliver. SMTP itself cannot provide a universal distributed exactly-once guarantee; the durable effect bounds retries and makes them auditable.

## Required rehearsal

- Fresh PostgreSQL: apply the complete migration history, run concurrent-index script, validate Prisma.
- Seeded upgrade: stop before the two expand migrations, seed high-cardinality gift cards/refunds/ledger rows, apply migrations, prove NULL legacy rows decode safely, then run each backfill with `batch_size=1` and prove no invocation changes more than one target row.
- P0 PostgreSQL: legacy replay later than previous limits and duplicates; concurrent gift-card webhooks; refund definitive failure release, ambiguous success/failure reconciliation, provider-success crash recovery, stale lease fencing, duplicate callback, and one stable provider idempotency key.
- Compare the full P0 baseline before and after the change.
