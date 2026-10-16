# Restaurant Analytics Copilot MVP Specification

## Goal

Provide restaurant owners/admins a read-only, tenant-safe analytics copilot that computes every fact deterministically and optionally asks a provider-neutral text model to explain a bounded snapshot.

## Scope

- Shared AI config, provider contract, OpenAI Responses adapter, disabled/fake providers, prompt registry, output validation, budgets, concurrency guard, structured logging, and durable redacted audit/usage.
- Authenticated `BUSINESS_ADMIN` and `RESTAURANT_ADMIN` only.
- Capabilities and query endpoints under `/api/v1/ai/analytics`.
- Sales/revenue, busy hours, cancellations, payment types, popular items, and staff activity proxy.
- Restaurant Admin reports-page interface with accessible states and EN/DE strings.

## Requirements

### AC-01 Configuration safety

Feature flag defaults false. No key is required for build/tests. Enabled configuration validates provider/model allowlist, numeric bounds, timeouts, and pricing inputs. Missing key produces deterministic fallback, not a provider call.

### AC-02 Tenant and role isolation

Only direct BUSINESS_ADMIN/RESTAURANT_ADMIN actors may query. Tenant and restaurant scope is resolved server-side; requested restaurant/branch must belong to the actor scope. No SUPER_ADMIN, BRANCH_ADMIN, CUSTOMER, STAFF, or DELIVERYMAN access in MVP.

### AC-03 Bounded typed request

Request includes UUID requestId, restaurantId, optional branchId, intent enum, preset/custom date-only period, optional previous-period comparison, IANA timezone, locale, and optional question <=500 characters. Maximum period is 366 days.

### AC-04 Deterministic snapshot

Repository runs six fixed bounded queries per period: sales aggregate, status counts, payment groups, top 10 items, 24 busy-hour groups, top 10 staff activity rows. Comparison adds the same six queries. Successful revenue uses the canonical SUCCESSFUL_ORDER_STATUSES. Cancel rate uses all non-payment-pending orders in range. Date-only boundaries are converted from restaurant/request timezone to half-open UTC ranges.

### AC-05 Model boundary

The model receives no SQL/tools, customer PII, raw payment/provider data, addresses, notes, secrets, or staff names. It receives a size-bounded JSON snapshot with pseudonymous staff refs plus the user question explicitly delimited as untrusted data. Output must pass strict schema and evidence-ID validation. Malformed/timeout/error responses use deterministic fallback.

### AC-06 Read-only and idempotent

No business model is mutated. Audit/usage persistence is the only write. Unique tenant+restaurant+requestId returns the previously stored safe response for retries. No automatic provider retry is used because duplicate model spend is not safely idempotent.

### AC-07 Rate, budget, and concurrency

Nest throttling limits endpoint calls. Persistent daily request/token/cost totals enforce tenant budgets. One active request per actor+restaurant per process; global provider concurrency is bounded. Provider timeout uses AbortSignal cancellation. Snapshot/model input and output sizes are capped.

### AC-08 Audit/privacy

Persist scope, actor, intent, dates, question SHA-256, prompt/model versions, status/fallback reason, token/cost/latency, snapshot hash, and safe response JSON. Never persist raw question or prompt. Rows are tenant/restaurant indexed and carry expiry for retention cleanup.

### AC-09 UI

Reports page adds an owner/admin-only Copilot section with period selector, examples, input, read-only disclosure, loading/error/disabled/empty/fallback states, answer, metric evidence, and generated timestamp. Keyboard and screen-reader behavior must pass tests. No provider/model/token details are shown.

## Out of scope

Arbitrary SQL/tools, semantic retrieval/vector DB, Redis/BullMQ, chat memory, autonomous actions, cross-restaurant analytics, production deployment, or applying migrations to shared/live databases.

## Acceptance

- All numeric answer evidence maps to snapshot metric IDs.
- Zero cross-tenant/restaurant/branch access in tests.
- No provider call when disabled, no key, over budget, duplicate, or invalid scope.
- Full API/admin gates pass; scratch migration apply/rollback/reapply passes.
