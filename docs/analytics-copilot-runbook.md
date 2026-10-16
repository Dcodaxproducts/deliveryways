# Analytics Copilot MVP API and Runbook

## Safety state

The feature and provider mode are disabled by default. No model allowlist, selected model, provider key, or pricing is required for install, tests, typecheck, or build while the feature is disabled. Enabled OpenAI mode fails startup unless all four are explicitly configured. Intentional deterministic-only operation requires `AI_ANALYTICS_COPILOT_ENABLED=true` together with `AI_PROVIDER=disabled`; a missing key never silently selects fallback provider mode.

## API contract

### `GET /api/v1/ai/analytics/capabilities`

Query: `restaurantId` (required), `branchId` (optional). Returns enabled/available state, read-only declaration, supported intents/periods, limits, and example questions. Requires a direct `BUSINESS_ADMIN` JWT; staff, branch admins, customers, deliverymen, and super admins are denied in the MVP.

### `POST /api/v1/ai/analytics/query`

```json
{
  "requestId": "uuid-v4",
  "restaurantId": "restaurant-id",
  "branchId": "optional-branch-id",
  "intent": "OVERVIEW",
  "period": "LAST_7_DAYS",
  "comparison": "PREVIOUS_PERIOD",
  "timezone": "Europe/Berlin",
  "locale": "en",
  "question": "Why did revenue change?"
}
```

Supported intents: `OVERVIEW`, `REVENUE`, `BUSY_HOURS`, `CANCELLATIONS`, `PAYMENT_TYPES`, `POPULAR_ITEMS`, `STAFF_PERFORMANCE`. Custom periods require date-only `fromDate`/`toDate` and are limited to 366 days. Responses contain `mode`, generated timestamp, period/comparison, answer, exact metric evidence, bounded breakdowns, and definitions. No provider/model/token details are returned.

## Metric definitions and query bounds

- Revenue/AOV/popular items/payment types/busy hours use canonical successful order statuses: `CONFIRMED`, `PREPARING`, `READY_FOR_PICKUP`, `PICKED_UP`, `READY_TO_SERVE`, `SERVED`, `OUT_FOR_DELIVERY`, `DELIVERED`.
- Cancellation denominator includes `PLACED`, successful, `CANCELLED`, and `REJECTED`; `PAYMENT_PENDING` is excluded.
- Date-only periods become half-open UTC boundaries in the supplied IANA timezone. A canonical restaurant timezone is not modeled yet, so the admin sends its resolved timezone and the response echoes it.
- Six fixed aggregate/group queries per period; comparison uses twelve. Top items and staff rows are capped at 10; busy-hour groups at 24. Staff activity is also owner-scoped so the existing owner/restaurant/time index is usable. No order/customer row history is loaded.
- No cache in the MVP: values remain fresh and there is no invalidation/cross-scope cache risk. Provider concurrency is bounded after DB transactions complete.

## Persistence and privacy

`AiAnalyticsUsage` stores tenant/restaurant/optional branch scope, actor, intent, range, SHA-256 question/snapshot hashes, prompt/model/provider versions, token/cost/latency/status, and safe response JSON. It never stores the raw question or provider prompt. Restaurant/branch identifiers and staff names are omitted from provider input. Unique scope+requestId supports replay without duplicate provider spend; replay is accepted only when actor, branch, intent, dates, timezone, locale, question hash, and prompt version match the original request. Expired rows are removed hourly in batches of 500.

Migration `20261016054500_add_ai_analytics_usage` is additive and has no backfill. See its README/ROLLBACK files. Apply only through the normal backed-up release flow; this implementation did not apply it to shared/live databases.

## Enablement

1. Apply the migration through the protected release process after backup/rehearsal.
2. Keep `AI_PROVIDER=disabled` for an explicitly approved deterministic-only rollout, or set `AI_PROVIDER=openai` for provider mode.
3. For OpenAI mode, explicitly set a non-empty `AI_ALLOWED_MODELS`, set `AI_ANALYTICS_MODEL` to an exact member of that allowlist, add `OPENAI_API_KEY` through protected environment management, and set both current nonzero token-pricing values. Never commit or paste the key in chat.
4. Set `AI_ANALYTICS_COPILOT_ENABLED=true` only after the complete selected-mode configuration and rollout approval are in place.
5. Verify capabilities, deterministic-only mode or provider mode as selected, runtime rate/budget fallback, audit rows, metrics, and kill switch.

Disable immediately with `AI_ANALYTICS_COPILOT_ENABLED=false`. Existing reports remain independent.
