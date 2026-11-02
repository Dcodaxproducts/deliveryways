# Development Log

## 2026-11-02 — unauthenticated table reservations

- Added `POST /customer-app/table-reservations/public` with optional JWT. Anonymous requests require `restaurantId`, `branchId`, ISO `reservationDate`, `guestCount`, bounded `guestName`, normalized lowercase `guestEmail`, normalized `guestPhone`, optional bounded note, and UUID `clientRequestId`.
- Authenticated callers retain authoritative account linkage through the existing reservation path. Anonymous bookings use non-login synthetic guest users keyed by restaurant plus client request UUID; real contact details remain reservation snapshots and are shown only through role/tenant-guarded admin reads.
- Public responses omit guest name, email, and phone. Branch scope is verified by authoritative `(branchId, restaurantId)` lookup. Existing feature flag, future-date validation, auto-accept capacity check, status flow, and notifications remain in force. Endpoint is throttled to five requests/minute.
- No schema migration. Existing JSON metadata storage is reused; rollback is code-only. No backfill or database lock risk.
- Query impact (anonymous create): one scoped branch lookup, one guest upsert, optional existing capacity scan only when auto-accept is enabled, one profile upsert; no N+1 and no cache. Stable request UUID prevents duplicate records for retries.
- Verification: focused TypeScript typecheck and customer-app Jest suite; full project gates recorded with the commit handoff.
- Limitation: the current product models branch-level table capacity, not individually selectable table IDs; this change preserves that canonical contract.

## 2026-11-02 — Guest reservation release blockers corrected

- Recomposed this feature onto cumulative release base `81d362bc7eeee350d6012f9e92ef7b4f6252d44f` (`origin/fix/landing-settings-reflection-20261024`), which contains `origin/develop` `35ab16057318c97545e598ce13727d9e6c0c5f36` plus the 228 cumulative production/release commits through the landing-settings freshness fix.
- Replaced synthetic guest users/profile metadata writes with additive `table_reservations` persistence. Authenticated reservations retain nullable `customer_id`; all rows store immutable guest contact snapshots. Public responses remain PII-free, while admin reads remain role/restaurant/branch scoped.
- Added durable idempotency for authenticated and guest flows: unique `(idempotency_scope, client_request_id)`, SHA-256 normalized payload fingerprint, transaction advisory lock, stable replay, and HTTP 409 for key reuse with a different payload.
- Serialized capacity claims with a branch-row `FOR UPDATE` lock and overlap count inside the same transaction. Canonical duration remains 30 minutes; auto-accept never confirms more than configured `tableCount`.
- Added server-authoritative slot checks for regular opening hours, holiday overrides/ranges, blackout ranges, breaks, temporary closures, future time, and 30-minute slot alignment (Asia/Karachi, matching the existing customer-app schedule convention).
- Added explicit `TRUST_PROXY` allowlist handling. Forwarded IP headers remain untrusted by default. Nest throttling remains process-local because this repository has no canonical Redis throttler storage; multi-instance deployments must add shared storage before relying on a global aggregate limit.

### Migration 20261102133000

- **Forward:** additive table creation, four foreign keys, unique idempotency index, three read/capacity indexes, and DB checks for duration, guest count, and status. No existing table rewrite or data lock beyond short catalog locks for create/index/foreign-key operations.
- **Compatibility/backfill:** reads merge new rows with legacy `profile.metadata.customerApp.tableReservations`. New writes use only the durable table. Backfill legacy JSON in bounded batches after validating branch/restaurant ownership; synthesize deterministic legacy idempotency scopes/keys and fingerprints; compare counts/statuses before retiring the fallback.
- **Rollback:** revert application first so old code does not write the new table, export `table_reservations`, then `DROP TABLE table_reservations`. Rollback loses rows created after cutover unless they are transformed back into profile metadata; therefore it is an operational/data migration, not an automatic down migration.
- **Rehearsal:** all 103 migrations applied successfully to disposable PostgreSQL 16; Prisma reported schema current and all expected indexes/check/FK constraints were verified. The disposable container was removed. No live/staging database was touched.

### Performance/security

- Create path: branch lookup + indexed idempotency lookup; one short transaction with advisory/branch lock, optional indexed overlap count, and one insert. Same-branch creates serialize deliberately; different branches proceed independently.
- Customer durable reads are capped at 100 rows; admin durable reads at 500 during legacy merge. Capacity lookup uses `(branch_id, reservation_date, status)`.
- Public response includes only reservation id, branch, date, guest count, note, status, and creation time. Contact snapshots are restricted to admin flows. Public route remains 5 requests/minute per trusted client IP. Bearer-token/public JSON requests do not rely on cookie authentication, so CSRF is not the control boundary; origin/CORS remains storefront-compatible and abuse is controlled by validation, idempotency, and throttling.


### Final compatibility and verification

- Existing authenticated callers remain backward compatible: `clientRequestId` is optional on `POST /customer-app/table-reservations`; when supplied it is honored durably, while legacy callers receive a server-generated key. The public anonymous contract still requires the UUID. Legacy metadata-era list/cancel/status flows remain as read/update fallback during backfill.
- Focused customer-app repository/DTO/service suites: 87/87 passed. Disposable PostgreSQL concurrency suite: 2/2 passed. Prisma generate/validate, typecheck, build, full lint, and diff checks passed.
- Full API regression run excluding the unrelated date-stale package-plan spec: 140 suites passed, 1 skipped; 1,521 tests passed, 2 skipped. The unfiltered run passed 140 suites and 1,571 tests but failed the pre-existing `PackagePlansService › does not generate an invoice before its billing period closes` expectation because its fixed 2026-11-01 period is already closed on 2026-11-02; no package-plan code was touched.
