# Financial ledger identity rollout

1. Deploy the expand migrations. They add nullable columns and build unique indexes with `CONCURRENTLY`; no full-table rewrite or blocking index build is used.
2. Application runtime supports both NULL/generic legacy identities and atomically adopts canonical identities under the account advisory lock.
3. Run `scripts/backfill-financial-ledger-identities.sql` repeatedly with a small `batch_size` (default 1,000). Commit each invocation independently and monitor replica lag and lock waits.
4. Before any future NOT NULL validation, require zero NULLs, no duplicate identities, and a completed replay rehearsal. This change intentionally does not add NOT NULL yet.

Ambiguous unlinked legacy refunds are intentionally not guessed. Runtime returns 409 until reconciliation; uniquely identifiable successful charges are linked by migration/runtime.

## Verification evidence (2026-10-14)

- Fresh PostgreSQL 16 database: all 132 migrations applied in 4,545 ms.
- Upgrade rehearsal: seeded pre-Increment-3 wallet/payment and restaurant-wallet rows, then applied all three ledger migrations successfully; row counts remained 1/1 and all three unique identity indexes were present.
- Index plan: the top-up natural-identity lookup used `wallet_transactions_payment_transaction_id_idx` (index scan cost `0.12..8.14`).
- Lock behavior: hot-table indexes use `CREATE INDEX CONCURRENTLY`; foreign-key validation is split into `NOT VALID` plus `VALIDATE CONSTRAINT`; backfill work is bounded with `FOR UPDATE SKIP LOCKED` and no migration performs a full-table identity update.
