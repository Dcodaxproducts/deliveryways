# Restaurant Analytics Copilot MVP Design

## Architecture

Controller -> AnalyticsCopilotService -> AnalyticsCopilotRepository + AiTextProvider. Scope resolver verifies tenant/restaurant/branch. Config and policy services gate before provider use. Audit repository persists redacted usage and replay-safe response.

## API

- `GET /ai/analytics/capabilities?restaurantId=...&branchId=...`
- `POST /ai/analytics/query`

Both use JWT, RolesGuard, TenantAccessGuard, BUSINESS_ADMIN/RESTAURANT_ADMIN role decorators, authenticated no-store middleware, and response envelope conventions.

## Persistence

One new `AiAnalyticsUsage` model is sufficient for MVP audit and usage budgets. It stores no raw question/prompt. Migration is additive: one enum, one table, FKs, unique idempotency key, and scoped indexes. No backfill. Lock risk is limited to short catalog locks for CREATE TYPE/TABLE/INDEX; no existing table rewrite. Rollback drops table then enum. Rehearse on disposable PostgreSQL only.

## Query and performance bounds

Six queries per period inside one short Prisma transaction; 12 with comparison; one scope lookup; one daily usage aggregate; create/update audit writes. Top items/staff limit 10, busy hours 24, payment/status enum groups bounded. No row history loaded. No cache in MVP to preserve freshness and avoid invalidation complexity. Provider calls occur after DB transaction completes. In-process global semaphore protects provider concurrency; DB work completes before waiting on external I/O.

## Failure behavior

Feature disabled -> capabilities disabled and query 503. Enabled but key absent/provider disabled/timeout/error/malformed output/budget model unavailable -> successful deterministic fallback with exact evidence. Database/audit failure fails closed. Duplicate completed request returns persisted safe response; duplicate in progress returns conflict.

## Security

No tools, SQL, URLs, or provider-native state. Provider endpoint is fixed. Question is delimited untrusted text. Output evidence IDs must exist in snapshot. Logs contain request/scope/status/latency only. Audit stores SHA-256 question hash and snapshot hash.
