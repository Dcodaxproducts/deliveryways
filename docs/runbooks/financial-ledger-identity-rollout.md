# Financial ledger identity rollout

1. Deploy the expand migrations. They add nullable columns and build unique indexes with `CONCURRENTLY`; no full-table rewrite or blocking index build is used. The refund migration only adds schema/indexes—the historical refund data update is deliberately outside migration deploy.
2. Deploy the application. Prisma keeps customer-wallet and restaurant-wallet `idempotencyKey` nullable during the rollout so legacy NULL rows decode safely. Every new canonical ledger write still supplies a non-NULL operation key, and database defaults protect remaining legacy write paths.
3. Backfill wallet identities in bounded batches. The script opens and commits exactly one transaction per invocation:
   - default (1,000 rows/table): `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/backfill-financial-ledger-identities.sql`
   - override: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v batch_size=500 -f scripts/backfill-financial-ledger-identities.sql`
   Repeat until both NULL counts are zero. Monitor replica lag and lock waits between invocations.
4. Link historical refunds separately with `scripts/backfill-refund-source-links.sql`. It locks at most `batch_size` refunds with `FOR UPDATE SKIP LOCKED`, links only rows with exactly one successful scope/currency-compatible charge, and commits exactly one transaction per invocation. Runtime never guesses: the existence of any unlinked legacy refund for an order returns 409 while linked refund capacity is computed by a database aggregate.
5. Before any future NOT NULL validation, require zero NULL identities, no duplicate identities, and a completed replay rehearsal. This rollout intentionally does not add NOT NULL.

## Refund-link invocations

- Default first page: `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/backfill-refund-source-links.sql`
- Override batch size: add `-v batch_size=500`.
- The result reports `scanned_refunds`, `linked_refunds`, and `next_cursor`. Pass the returned cursor with `-v after_id='<next_cursor>'` to continue past ambiguous rows. Start again without `after_id` after reconciliation to pick up rows that became linkable. Stop a pass when `scanned_refunds` is zero.

Ambiguous unlinked legacy refunds are intentionally not guessed. Reconcile them manually, then rerun the bounded linker.

## Verification required for each rollout

- Fresh database: apply all migrations.
- Upgrade rehearsal: seed pre-Increment-3 wallet/restaurant-ledger NULL identities plus linked and unlinked refunds, apply Increment-3 migrations, verify Prisma can decode/adopt NULL identity rows, and run both backfill scripts exactly as documented.
- Large legacy-refund fixture: verify the runtime existence lookup uses `payment_transactions_legacy_refund_capacity_idx`, returns one bounded row, and refund capacity uses the linked-refund aggregate index.
- Confirm migration SQL contains no historical refund `UPDATE` and scripts affect no more than the configured batch size per invocation.


## Verified evidence (2026-10-14)

- Fresh PostgreSQL 16 rehearsal applied all 132 migrations successfully.
- Seeded pre-Increment-3 upgrade preserved one customer-wallet NULL identity, one restaurant-wallet NULL identity, and one unlinked refund through schema migration; the default script invocations backfilled all three safely.
- Batch-size rehearsal seeded two NULL rows per ledger and two unlinked refunds. One `batch_size=1` invocation left exactly one row in each category, proving bounded work and one commit per invocation.
- A PostgreSQL P0 fixture seeded 5,000 unlinked refunds across 5,000 orders. The one-row existence query used `payment_transactions_legacy_refund_capacity_idx`; all 15 affected financial P0 tests passed, including NULL decode/adoption.
