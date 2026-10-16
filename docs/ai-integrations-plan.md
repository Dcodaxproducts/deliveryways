# FeastFlow AI Integrations Implementation Guide

**Status:** implementation plan only; no product code, database change, deployment, or secret is authorized by this document  
**Repository baseline:** `feastflow-platform-api` commit `d27bfe479f2d7500259a53da554a61c0781dab20` (`sync/deliveryway-parity-20261016`)  
**Companion baselines inspected:** restaurant admin `70a9778948be21347c71042036c26d9bb4ad9d79`; customer website `2552d319b665916857e5a560f31e9b6836931f35`  
**Last verified:** 2026-10-16

## Analytics Copilot MVP implementation addendum (2026-10-16)

The implementation branch uses one additive `AiAnalyticsUsage` table for durable redacted audit, idempotency, usage budgets, and safe-response replay. This differs from the broader future-platform model set by intentionally avoiding speculative tables. The MVP uses PostgreSQL plus existing Nest scheduling/throttling; it adds no Redis, BullMQ, vector store, or provider SDK. Native HTTP calls are isolated behind `AiTextProvider`. Snapshots are not cached because freshness and simple tenant-safe invalidation outweigh the small aggregate-query cost at pilot scale. See [Analytics Copilot runbook](./analytics-copilot-runbook.md).

## 1. Executive recommendation

Build a small shared AI platform, then ship a **read-only Restaurant Analytics Copilot first**. It has the best data readiness and lowest operational risk because FeastFlow already has bounded, tenant-scoped reporting queries and dashboard UI. The model should explain a server-generated, deterministic analytics snapshot; it must not generate or execute SQL.

Recommended order:

1. **Restaurant Analytics Copilot** — read-only MVP, 3–5 engineer-weeks after the shared foundation.
2. **AI Menu Assistant** — draft-only copy, translations, and metadata; 3–5 weeks.
3. **Review/Support Automation** — summaries, triage, and reply drafts; 4–6 weeks.
4. **Sales/Demand Forecasting** — deterministic forecast service plus LLM explanation; 5–8 weeks and sufficient history.
5. **Operational Anomaly Detection** — deterministic rules/statistics plus explanation; 4–7 weeks.
6. **Customer Ordering Assistant** — constrained catalog/cart guidance; 5–8 weeks because customer safety, latency, and prompt-injection exposure are higher.
7. **Smart Promotions/Retention** — recommendations and draft campaigns only; 6–9 weeks after consent and experiment foundations exist.

These are sequencing estimates, not commitments. Shared work is not repeated in each estimate. Features 4–7 depend on production-quality event/consent data and should not be accelerated by allowing an LLM to mutate financial or customer state.

## 2. Repository-grounded current state

### 2.1 Live architecture inspected

| Area              | Verified state                                                                                                                                                                         | Planning consequence                                                                                                                                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API               | NestJS 11 modular monolith, Prisma 7, PostgreSQL, base path `/api/v1`                                                                                                                  | Add an `ai` bounded context with controller → service → repository/provider adapters.                                                                                                                                                  |
| Tenant/auth       | JWT claims include `tid`, `rid`, and `bid`; `JwtAuthGuard`, `RolesGuard`, and `TenantAccessGuard` protect admin routes; staff restaurant/branch access is hydrated by `RolesGuard`     | Every AI request, snapshot, job, cache key, audit row, and retrieval filter must carry tenant + restaurant + optional branch scope. Do not trust model-produced IDs.                                                                   |
| Reporting         | `admin-reports` exposes `GET /admin/reports/orders` and `financial`; `admin-dashboard` exposes restaurant overview, order/revenue trends, stats, alerts, activity, and top restaurants | Reuse deterministic repository logic or extract a shared analytics snapshot service; do not scrape UI or call the API recursively.                                                                                                     |
| Orders/payments   | `Order`, `OrderItem`, `PaymentTransaction`, refund lifecycle fields, idempotency keys, financial ledger, and normal quote/checkout/payment endpoints exist                             | Good analytics inputs. AI is forbidden from issuing refunds, marking payments, approving payouts, changing status, or bypassing normal quote/checkout contracts.                                                                       |
| Menu/localization | Full menu/category/item/variation/modifier/branch override models; `EntityTranslation`; item CRUD and localization endpoints                                                           | Strong basis for draft generation. Generated fields require validation and explicit human apply.                                                                                                                                       |
| Customers/loyalty | `User`, `Profile`, `Order`, `CouponUsage`, `LoyaltyAccount`, and `LoyaltyTransaction` exist                                                                                            | Purchase segmentation is possible; marketing consent, suppression, campaign exposure, and attribution are missing.                                                                                                                     |
| Promotions        | `Coupon` supports campaign kind/audience/order types, schedules, limits, scopes, and usage; admin campaign/happy-hour/gift-card UI exists                                              | AI can recommend drafts; existing deterministic coupon validation remains authoritative.                                                                                                                                               |
| Reviews/support   | `OrderReview`, `ContactSubmission`, `ChatThread`, and `ChatMessage` exist; partner pages include contact submissions and live chat                                                     | Summaries and reply drafts are possible. Review replies, labels, SLA, moderation decisions, and consent/retention controls need models or metadata.                                                                                    |
| Notifications     | Email via Nodemailer and SMTP env; push via Firebase Admin and `PushDeviceToken`; durable `Notification` rows with status, idempotency, and retry                                      | Reuse only after consent and human approval. No SMS dependency or provider is present.                                                                                                                                                 |
| Jobs              | Nest Schedule and hourly cron services exist; durable lease/idempotency patterns exist in `OrderPostCommitEffect`, `GiftCardEmailEffect`, notifications, and refund workflows          | There is **no BullMQ or Redis dependency/configuration in the inspected API**. Start MVP with bounded synchronous work and/or a PostgreSQL-backed `AiJob` lease pattern; add Redis/BullMQ only as an explicit infrastructure decision. |
| Cache             | Authenticated responses are `private, no-store`; public media uses cache headers; no application Redis client is present                                                               | Do not cache personalized answers at HTTP/shared-cache level. Cache deterministic snapshots only under fully scoped keys/rows with short TTL and invalidation.                                                                         |
| AI/vector         | No OpenAI/Anthropic/Gemini SDK, AI provider abstraction, embedding model, pgvector schema, or vector service was found                                                                 | All AI/provider capability is new. Embeddings/vector storage are unnecessary for Analytics MVP.                                                                                                                                        |
| Clients           | Next.js 16/React 19 restaurant admin and customer website; TanStack Query; no canonical FeastFlow mobile client repository found under `/opt/projects`                                 | Implement partner and web surfaces first. A future mobile client should consume the same versioned APIs.                                                                                                                               |

The separate `/opt/projects/feastflow-backend` checkout is a different driver-oriented repository and is not the canonical platform API for this plan.

### 2.2 Existing data that is useful but not automatically sufficient

- Revenue, order counts, statuses, order type, payment method/status, discounts, fees, timestamps, branch, customer, and item snapshots are available.
- `OrderItem.menuItemName`, unit price, quantity, line total, variation, modifiers, and notes preserve order-time context.
- Reviews have rating and optional comment, linked to order/customer/restaurant/branch.
- Inventory has current quantity, reorder level, unit cost, movements, and menu recipes.
- Coupon usage, loyalty balances/history, notifications, chats, and contact submissions exist.
- Restaurant/branch settings are JSON and must be normalized before becoming model context.

Missing cross-feature prerequisites include explicit AI consent/opt-out policy, marketing consent and suppression, AI audit/usage/job tables, prompt registry, evaluation datasets, feature flags, token/cost budgets, data retention rules, normalized restaurant timezone/holiday calendar, campaign exposure attribution, abandonment/search events, and reliable external demand signals.

## 3. Non-negotiable boundary: computation versus language

1. **Deterministic code owns facts and actions.** SQL/Prisma repositories calculate totals, cohorts, forecasts, anomaly scores, eligibility, prices, discounts, inventory implications, and confidence intervals.
2. **The LLM receives a bounded, typed snapshot** and may summarize, translate, classify, or explain it. Each factual answer returns snapshot timestamp, scope, date range, definitions, and source references.
3. **No arbitrary SQL tool.** The model cannot submit SQL, Prisma filters, raw URLs, table names, or unbounded date ranges. It chooses only from versioned allowlisted tools with validated enums and hard server-side bounds.
4. **No risky action tool.** The LLM cannot create/submit an order, charge/refund a payment, approve/mark a payout, alter wallet/loyalty balances, create/activate a discount, send a campaign, change inventory, or change order/payment status.
5. **Human or customer confirmation is mandatory.** AI outputs are drafts/recommendations. Normal FeastFlow endpoints, guards, validation, idempotency, and confirmation UI perform any accepted change.
6. **Fail closed.** Missing scope, stale/partial snapshots, moderation failure where required, low forecast confidence, provider timeout, or budget exhaustion yields a deterministic fallback—not invented data.

## 4. Recommended shared AI platform

Create `src/modules/ai/` as a bounded context, with public interfaces rather than provider calls spread through business modules.

```text
src/modules/ai/
├── ai.module.ts
├── ai.controller.ts                 # versioned feature endpoints
├── application/                     # orchestration and policy
├── domain/                          # typed snapshots/results; no provider SDK types
├── providers/                       # AiTextProvider and provider adapters
├── prompts/                         # prompt IDs, versions, schemas, fixtures
├── tools/                           # allowlist + JSON-schema validation
├── retrieval/                       # scoped snapshot builders, optional vector adapter
├── jobs/                            # lease worker now; optional BullMQ adapter later
├── evaluation/                      # golden cases and graders
└── repositories/                    # AI-only persistence
```

### 4.1 Core contracts

- `AiTextProvider.generate(request): AiGenerationResult`: provider-neutral input, structured output schema, time/token limits, no business actions.
- `AiEmbeddingProvider.embed()`: separate optional interface; do not instantiate until a retrieval use case passes evaluation.
- `PromptRegistry`: immutable prompt ID + version + locale + expected JSON schema + owner + change note. Production requests record the exact version.
- `AiToolRegistry`: explicit tools such as `get_sales_summary_v1` and `search_menu_v1`; schema validation, server-side scope injection, field allowlist, row/date caps, and read-only designation.
- `AiSnapshotService`: creates normalized, PII-minimized JSON snapshots from repositories. Snapshots include `tenantId`, `restaurantId`, optional `branchId`, range, generatedAt, schemaVersion, dataQuality, and source watermark.
- `AiPolicyService`: role/permission check, consent, moderation, budget, feature flag, retention, locale, and human-approval policy.
- `AiUsageMeter`: provider/model, input/output tokens, latency, status, estimated cost, cache/snapshot hit, correlation ID—never full secrets or raw payment/provider data.

### 4.2 Likely new models (design and migration review required)

All tenant-owned rows need composite indexes beginning with scope and time; raw prompts should not be stored by default.

- `AiPromptVersion`: prompt key/version/hash/status/schema; global or tenant override with strict ownership.
- `AiInteraction`: scoped actor/feature/request status, redacted input summary, output reference, model/version, approval state, expiration.
- `AiUsageEvent`: scoped feature/provider/model/tokens/latency/cost/status/createdAt.
- `AiAuditEvent`: actor, feature, action, prompt version, tool names, snapshot ID, approval/rejection, policy outcome.
- `AiDataSnapshot`: scoped typed JSON, source watermark/hash, freshness, expiresAt; encrypt or omit sensitive fields.
- `AiJob`: type, idempotency key, status, attempts, lease token/expiry, notBefore, error, payload reference.
- `AiConsent`: subject/scope, purpose, legal basis or consent source, granted/withdrawn timestamps, policy version. Marketing consent should be separate from service-assistant consent.
- `AiEvaluationRun`: feature/prompt/model/dataset version, metrics, pass/fail, release SHA.

Prefer extending `StaffActivityLog` for human “apply/send/approve” events only if its owner-based scope fits; keep model/tool/usage telemetry in AI-specific tables.

### 4.3 Provider and storage default

- Use a provider-neutral adapter. The first adapter uses the OpenAI **Responses API** with an operator-supplied model allowlist. Do not place mutable model IDs in source defaults: evaluate currently available models, approve exact IDs operationally, and provide both the allowlist and selected model through protected deployment configuration.
- Use structured JSON output and strict application validation. Do not expose provider-native tool definitions outside the adapter.
- **Embeddings/vector store: not required for phases 0–1.** Menu search can use PostgreSQL exact/full-text/trigram retrieval first. If semantic retrieval later proves useful, prefer self-hosted pgvector in the existing PostgreSQL after extension/backup/load testing; choose and dimension any embedding model only after a current provider-catalog and evaluation review. pgvector is not installed or modeled today. A managed vector account is unnecessary unless scale/operations justify it.
- Translation: no separate translation service is required initially; current OpenAI models are documented as multilingual, and generated translations remain drafts in `EntityTranslation`. DeepL is optional later if measured quality or terminology control is better.
- Moderation: use an approved provider moderation capability for customer/support free text when policy requires it. Select any concrete moderation model through reviewed configuration rather than a source default. Application policy—not the score alone—decides block/review/fallback.

Official references: [Responses API](https://developers.openai.com/api/reference/resources/responses), [model catalog](https://developers.openai.com/api/docs/models), [embeddings](https://developers.openai.com/api/docs/guides/embeddings), [moderation](https://developers.openai.com/api/docs/guides/moderation), [pgvector](https://github.com/pgvector/pgvector), and [BullMQ](https://docs.bullmq.io/).

### 4.4 Jobs, limits, caching, and observability

- MVP: maximum one active request per actor/restaurant/feature, 10–15 second provider deadline, one bounded retry only for retryable provider errors, maximum output tokens per feature, and daily tenant/user token and currency budgets.
- Durable batch work: `AiJob` with unique idempotency key, `FOR UPDATE SKIP LOCKED`/lease semantics, bounded batch size, jittered retry, dead-letter status, and scheduled recovery. Never keep DB transactions open during provider calls.
- Redis/BullMQ option: introduce only after operational approval and a deployed Redis service/`REDIS_URL`; BullMQ requires Redis and is not currently installed. It is useful for forecasting, bulk translation, and campaign batches, but is not an Analytics MVP prerequisite.
- Cache deterministic snapshots, never raw cross-user completions. Key/row scope includes environment, feature, schema version, tenant, restaurant, branch, date range, locale, and source watermark. Suggested TTL: 5 minutes for live analytics, 1–6 hours for menu retrieval, 24 hours for historical forecast features. Mutation/event invalidation beats blind TTL where feasible.
- Existing Nest Logger and `system-health` provide a base. Add dashboards/alerts for request count, success/error/fallback, p50/p95 latency, tokens/cost by tenant/feature, policy blocks, tool calls, stale snapshots, queue depth/age, and evaluation regressions. Sentry/OpenTelemetry is optional later; no current dependency or account is assumed.

## 5. Feature plans

### 5.1 Restaurant Analytics Copilot — first release

**Use cases and users.** Business Admin, Restaurant Admin, permitted Branch Admin, and appropriately scoped staff ask “Why did revenue change?”, “What sold best?”, or “Compare delivery and takeaway.” Super Admin may use an explicitly selected tenant/restaurant scope; no platform-wide customer-level narrative in MVP.

**Readiness.** Existing `AdminReportsRepository` already builds orders/financial reports, date ranges, status exclusions, top items, and payment/order-type breakdowns. `AdminDashboardRepository` provides order/revenue trends and restaurant overview. Missing: reusable typed snapshot contract, comparison-period definitions, provenance, data-quality flags, AI tables/provider, and AI-specific permission key/feature flag.

**Inputs/data sources.** `Order`, `OrderItem`, `PaymentTransaction`, `Coupon`/`CouponUsage`, `OrderReview`, restaurant/branch currency/timezone settings; reuse `admin-reports` and `admin-dashboard` repository calculations. Default 7/30 days; hard maximum 366 days; at most two comparison periods and top 25 items/categories.

**Outputs.** Structured answer with headline, 3–5 evidence cards, metric definitions, comparison deltas, caveats/data quality, suggested follow-up questions, and snapshot timestamp. No customer names/emails/addresses/notes.

**Proposed surfaces.** API `POST /ai/analytics/query`, `GET /ai/analytics/suggestions`, and `GET /ai/interactions/:id`; partner UI adds a Copilot panel to `src/app/(dashboard)/reports/page.tsx` and optionally a read-only card on dashboard. Backend touches new `ai` module and reads the admin report/dashboard repositories through a stable public analytics interface; likely models read: `Order`, `OrderItem`, `PaymentTransaction`, `CouponUsage`, `OrderReview`.

**Safety/operations.** Data minimization uses aggregates with small-cell suppression (for example, no cohort detail below 10 customers); 30-day interaction retention by default, shorter/redacted raw input retention, deletion support; role/scope is resolved server-side. Prompt text is untrusted and cannot alter tool scope. Human approval is unnecessary because output is read-only, but every answer has feedback/report controls and audit/usage rows. Rate limit recommendation: 10 queries/user/hour, 100/restaurant/day, configurable budget. Cache only snapshot JSON for 5 minutes. Provider timeout/budget/low-confidence fallback renders deterministic report cards. Request ID is the idempotency key for duplicate retries.

**Evaluation/test/rollout.** Golden questions with exact numeric assertions, citation coverage, hallucination rate, answer helpfulness, no-PII/no-cross-tenant tests, prompt-injection corpus, stale/empty/partial data, timezone/date boundaries, provider timeout, budget exhaustion, concurrent duplicates, and cold/warm snapshot query-count tests. Target: 100% numeric claims trace to snapshot fields; zero unauthorized rows; ≥90% golden-question correctness; p95 snapshot generation under 2 seconds at representative volume; provider p95 under the configured deadline. Roll out internal demo → 2 opt-in restaurants → 10% → 100%, feature-flagged per tenant/restaurant with instant kill switch.

**Risks/effort/dependencies.** Metric definition drift and overconfident prose are primary risks. Dependency: shared foundation, extraction of one canonical report snapshot, product-approved metric glossary, provider account. Effort 3–5 weeks after foundation.

### 5.2 AI Menu Assistant

**Use cases/users.** Restaurant/Business Admin and staff with menu-management permission generate or improve item name, description, ingredients phrasing, dietary/allergen draft warnings, image alt text, and locale drafts. Branch Admin can draft only within existing branch/menu permissions.

**Readiness.** `MenuItem` already stores description, ingredients, nutritional information, dietary/allergen flags, prices, prep time, image, categories/cuisines/modifiers/variations; `EntityTranslation` supports locale fields; partner item forms and services exist. Missing: controlled vocabulary/brand voice, source-of-truth allergen workflow, nutrition/legal disclaimer rules, prompt/evaluation fixtures, and draft/apply audit.

**Inputs/data sources.** Selected menu item/category/cuisine/modifiers/variations, restaurant branding/tagline, target locale, optional admin-provided facts. Never infer allergens, ingredients, nutrition, or dietary compliance from an image/name alone. Maximum one item/request in MVP; bulk jobs later capped at 100 items.

**Outputs.** Schema-validated draft fields plus warnings, unsupported-claim flags, and source-field references. No direct persistence. Proposed API `POST /ai/menu/items/:id/draft`, `POST /ai/menu/items/:id/translate`, and explicit normal `PATCH /menu/items/:id`/`PUT /localizations/...` only after preview approval. Partner UI integrates into `CreateMenuItemModal`/item edit and localization controls. Backend reads `MenuItem`, related menu models, `EntityTranslation`, `Restaurant`; writes only AI draft/audit tables until human apply.

**Safety/operations.** Minimize context to menu/brand data; no customer data. Keep drafts 30 days and usage/audit per retention policy. Enforce existing menu RBAC and restaurant scope. Treat menu text and uploaded metadata as untrusted prompt content; no network/file tools. Require human checkbox for factual accuracy, allergen and legal claims before apply. Rate limit 20 drafts/user/hour; per-tenant daily token budget. Cache identical normalized source hash + locale + prompt version for 24 hours. Idempotency uses source hash/request ID. If provider fails, retain manual form and existing translation workflow.

**Evaluation/test/rollout.** Schema validity, prohibited claim detection, preservation of supplied facts, terminology/locale review by native speakers, length/style constraints, prompt injection in menu text, XSS escaping, cross-tenant tests, stale-source conflict test, duplicate apply, provider failure, bulk lease/retry, cold/warm cache. Metrics: edit distance/acceptance rate, human rejection reason, factual-error/allergen-claim rate (target zero ungrounded), latency/cost. Roll out descriptions only → translations → optional bulk drafts. Effort 3–5 weeks; depends on foundation, product voice/locale glossary, and legal/allergen sign-off.

### 5.3 Customer Ordering Assistant

**Use cases/users.** Anonymous storefront visitor or authenticated Customer asks for available dishes by dietary preference, budget, category, or occasion and receives menu links or a proposed cart. It can explain modifiers and branch availability. It never submits an order or payment.

**Readiness.** Public customer catalog endpoints, branch/domain context, item details, promotions, cart/quote/checkout, favorites, and group orders exist; customer UI has menu, item details, cart/checkout, and chat pages. Missing: assistant conversation model/consent, robust catalog search index, session abuse controls, verified dietary/allergen semantics, anonymous quota, retrieval evaluation, and analytics for search/assistant outcomes.

**Inputs/data sources.** Active branch-scoped menu snapshot (`MenuItem`, categories, cuisines, variations, modifiers, branch overrides, translations), availability, deterministic prices, promotion display eligibility, explicit user preferences, and optionally current cart after authentication. Exclude internal cost, other customers, staff notes, provider/payment data, and inactive/deleted items. Search returns max 20 candidates; model sees max 10 and a bounded conversation window.

**Outputs/surfaces.** Recommendations with item IDs/links, exact server-provided price/availability, allergen caveats, clarification questions, and a proposed cart delta. Proposed API `POST /ai/customer-assistant/messages`; optional read-only tools `search_menu_v1`, `get_item_options_v1`, `get_cart_summary_v1`. Customer website adds an assistant drawer on menu/details. Any add-to-cart proposal is displayed for customer confirmation and then uses the existing cart endpoint; quote/order/payment remain existing deterministic flows.

**Safety/operations.** Separate consent notice; anonymous session IDs rotate and expire; do not store precise address/payment data in AI history. Suggested conversation retention 7 days anonymous/30 days authenticated, with delete/opt-out. Scope is derived from domain/branch and rechecked on every tool call. Moderate customer input/output; instructions embedded in item content cannot call tools or override policy. No medical claims—dietary/allergen answers cite stored fields and tell users to confirm with restaurant. Human approval is customer confirmation. Limit 5 messages/10 minutes/session and 50/day/account; cap tools/turn and spend. Cache branch catalog retrieval by scoped version hash, not conversation. Idempotent message/request IDs. Fallback is normal search/menu UI and support contact.

**Evaluation/test/rollout.** Retrieval precision/recall, valid-item rate, price/availability exactness, allergen safety, task completion, add-to-cart acceptance, abandonment, latency/cost; adversarial prompts, cross-domain/tenant, deleted/unavailable item, stale cache, anonymous/auth transition, moderation/provider failure, and load tests. Shadow retrieval → internal authenticated beta → opt-in storefronts → anonymous traffic. Effort 5–8 weeks; dependencies include consent copy, normalized menu metadata, catalog versioning/search, abuse controls, and customer analytics.

### 5.4 Sales and Demand Forecasting

**Use cases/users.** Business/Restaurant/Branch Admin view daily/weekly order, revenue, item demand, and ingredient-demand forecasts with ranges and drivers for staffing/procurement planning.

**Readiness.** Historical order/item timestamps, branch/order type, statuses, prices, inventory/recipe data, and report trends exist. Missing: data-volume/quality audit, restaurant timezone calendar, closures/hours history, stockout indicators, promotion exposure, weather/local-event feeds, forecast backtesting registry, and forecast snapshots.

**Inputs/data sources.** Successful `Order`/`OrderItem` history, refunds/cancellations, `CouponUsage`, branch/order type, menu lifecycle, `InventoryMovement`/`MenuItemRecipe`; optional approved holiday/weather/events. Minimum recommendation: 90 days for basic daily forecast, preferably 12 months for seasonality; never fabricate a forecast when history is insufficient. Bound training to one restaurant/branch and rolling 24 months.

**Outputs/surfaces.** Deterministic point forecasts, 50/80/95% intervals, backtest error, data sufficiency, item/ingredient quantities, and drivers; LLM writes a plain-language explanation only. Proposed `GET /ai/forecasts/sales` and `POST /ai/forecasts/jobs`; partner reports/inventory pages show charts and downloadable plans. Reads `Order`, `OrderItem`, `CouponUsage`, `InventoryItem`, `InventoryMovement`, `MenuItemRecipe`; writes forecast/job/evaluation snapshots.

**Safety/operations.** Aggregate only; avoid customer PII entirely. Tenant/restaurant/branch scope and forecast permission required. No model tool can write purchase/inventory/staffing actions. Human chooses whether to use a forecast. Nightly/weekly jobs use idempotency `scope+horizon+dataWatermark+algorithmVersion`, bounded concurrency, retry/dead-letter. Cache immutable forecast versions until source watermark changes. Fallback shows historical baseline and “insufficient data.” Budget primarily compute; LLM explanation is optional/capped.

**Evaluation/test/rollout.** Rolling-origin backtests against seasonal-naive baseline; WAPE/MAE/bias/interval coverage by branch/item/horizon; data leakage, timezone/DST, closure, promotion, new item, sparse history, refund/cancel, late data, concurrency/retry, query-plan/load tests. Acceptance: beat agreed baseline on representative tenants without systematic bias and display confidence/data gaps. Shadow forecasts for 4–8 weeks → admin beta → planning use only. Effort 5–8 weeks; depends on history quality, calendar/timezone, product horizon/granularity, and optional external-data contracts.

### 5.5 Smart Promotions and Customer Retention

**Use cases/users.** Business/Restaurant Admin receives deterministic cohort/retention insights, eligible audience size, projected margin guardrails, and a draft `Coupon` campaign/message. No automatic activation or send.

**Readiness.** Customer orders, coupon use, loyalty history, campaign structures, notifications, email, and push exist. Missing: marketing consent/purpose, unsubscribe/suppression, campaign exposure/delivery attribution, holdout/A-B assignment, churn definition, contribution-margin model, frequency caps, quiet hours, and fairness policy.

**Inputs/data sources.** Pseudonymous customer features computed in PostgreSQL: recency/frequency/monetary value, order type, coupon response, loyalty activity, notification outcomes, and restaurant scope. Never send names, emails, phone, address, message text, or raw payment data to the model. Deterministic eligibility excludes withdrawn consent, suppressed users, recent contacts, abuse/fraud flags, and uneconomic offers.

**Outputs/surfaces.** Cohort definition, reason codes, expected audience, margin/cost range, experiment design, coupon draft fields, and message variants. Proposed `POST /ai/promotions/recommendations`, `POST /ai/promotions/:recommendationId/draft`; partner promotion-management page previews. Applying uses existing admin promotions endpoints after approval; sending uses existing notification mechanisms only after consent/frequency recheck. Likely reads `Order`, `Coupon`, `CouponUsage`, `LoyaltyAccount`, `LoyaltyTransaction`, `Notification`; needs consent/suppression/exposure models.

**Safety/operations.** GDPR purpose limitation, documented lawful basis, opt-out/delete/export, short feature retention (for example 90 days), aggregation/small-cell suppression, and no sensitive-trait inference/proxy targeting. Tenant scope and promotion permission are mandatory. Model cannot select arbitrary user IDs or activate/send. Human approval twice: campaign economics/content, then launch. Limits: 10 recommendations/day/restaurant, explicit spend/discount/frequency caps. Idempotent audience snapshot + campaign version. Cache cohort counts briefly; recompute eligibility at send. Fallback is existing manual promotion UI.

**Evaluation/test/rollout.** Offline precision/lift simulation, consent exclusion = 100%, margin guardrail, audience stability, fairness/proxy review, content quality, attribution accuracy; cross-tenant, deletion/withdrawal, duplicate send, concurrent campaign, stale eligibility, provider failure, holdout integrity, and notification idempotency tests. Roll out insights only → draft campaigns → small consented experiment with holdout. Primary metrics: incremental conversion/revenue/margin, unsubscribe/complaint rate, discount cost, retention—not raw opens. Effort 6–9 weeks; blocked on consent, suppression, attribution, experiment, and economics definitions.

### 5.6 Review and Support Automation

**Use cases/users.** Restaurant/support staff see sentiment/topic/urgency, duplicate detection, summaries, and reply drafts for `OrderReview`, `ContactSubmission`, and `ChatThread`. Customers continue using existing review/contact/chat surfaces.

**Readiness.** Reviews, support submissions, chat threads/messages, reply endpoint, email, and partner UIs exist. Missing: review-reply representation, taxonomy/priority/SLA, escalation state, AI draft linkage, redaction, approved tone/playbooks, and quality sampling.

**Inputs/data sources.** Rating/comment, contact subject/message, bounded recent chat messages, related order status/type only when staff is authorized and it is necessary. Redact email/phone/address/payment/provider data and secrets before provider submission. Limit chat context by messages and characters.

**Outputs/surfaces.** Structured topics/sentiment/urgency/confidence, concise summary, suggested reply, escalation reason, and policy citations. Proposed `POST /ai/support/:kind/:id/analyze`, `POST /ai/support/:kind/:id/draft-reply`; integrate into contact-submissions/live-chat and a future review queue. Existing `POST /contact-submissions/:id/reply` or chat message endpoint sends only after staff approval. Reads `OrderReview`, `ContactSubmission`, `ChatThread`, `ChatMessage`, minimal `Order`; writes AI interaction/audit and optional triage metadata.

**Safety/operations.** Support content may contain sensitive data: redact, minimize, encrypt references, default 30-day AI artifact retention, honor account deletion/legal hold. Enforce support permissions and exact tenant/restaurant/branch relationship. Treat every customer message as hostile prompt input; no tools beyond scoped reads. Moderate threats/abuse and use deterministic escalation for safety, chargeback, legal, allergen/health, or refund requests. Never promise compensation/refund or send automatically in MVP. Limits: 30 drafts/user/hour; batch summaries through bounded jobs. Idempotent content hash + prompt version. Provider failure leaves manual support intact.

**Evaluation/test/rollout.** Human rubric for factuality, empathy, policy compliance, escalation recall, harmful-content handling, language quality; redact leakage rate target zero; prompt-injection, PII, long thread, cross-tenant, deleted customer, refund coercion, moderation failure, duplicate reply, and accessibility tests. Shadow labels → staff draft beta → optional low-risk macros; no autonomous financial/support action. Metrics: draft acceptance/edit rate, first-response time, escalation recall, reopen/complaint rate. Effort 4–6 weeks; depends on playbooks, escalation owner, retention/DPA decision, and review reply product scope.

### 5.7 Operational Anomaly Detection

**Use cases/users.** Restaurant/Branch Admin and operations staff receive alerts for abnormal order failure/cancellation, payment failure/refund, preparation/delivery delay, inventory movement, notification failure, or sudden sales drop/spike.

**Readiness.** Orders have status/timestamps/estimated preparation and delivery data; payments/refunds are modeled; inventory movements, notifications, dashboard system alerts, and system-health metrics exist. Missing: canonical operational SLOs, complete status-transition/event history, stockout reason, anomaly baselines, alert acknowledgement/resolution, and incident feedback.

**Inputs/data sources.** Time-bucketed aggregates from `Order`, `PaymentTransaction`, `InventoryMovement`, `Notification`, `Deliveryman`, `StaffActivityLog`, and `system-health`; optional WinOrder health. Fixed scope/window and minimum sample count. Do not use an LLM or embeddings to calculate anomaly scores.

**Outputs/surfaces.** Deterministic anomaly event with metric, expected/actual range, severity, confidence/sample size, first/last observed, scope, and runbook link. LLM optionally summarizes likely known contributors from the snapshot, clearly labeled—not root-cause proof. Proposed `GET /ai/anomalies`, `POST /ai/anomalies/:id/acknowledge`; surface in dashboard system alerts/notifications. New anomaly/job/audit models likely; read existing operational models only.

**Safety/operations.** Aggregates only; redact actor/customer PII. Restaurant/branch permissions and tenant-scoped alert routing. No remediation tool or automatic payment/order/inventory mutation. Human acknowledges/escalates. Use per-metric cooldown/dedup key, severity budgets, and maximum alerts/day to prevent fatigue. Short-lived aggregate cache; immutable anomaly evidence snapshot. Jobs idempotent by scope+metric+bucket+algorithm version. Fallback keeps deterministic alerts even if LLM explanation fails.

**Evaluation/test/rollout.** Replay known incidents and synthetic spikes; precision/recall, false alerts/restaurant/day, detection delay, acknowledgement usefulness; seasonality, low-volume branches, timezone/DST, deployment windows, missing/late data, retries, duplicate buckets, cross-tenant, query-plan/load tests. Shadow 4 weeks → ops-only alerts → restaurant opt-in. Acceptance thresholds must be product-defined; prioritize precision. Effort 4–7 weeks; depends on SLOs, event/history quality, runbooks, and alert ownership.

## 6. Security, privacy, compliance, and governance baseline

This baseline applies to **every feature** in addition to its feature-specific controls:

- Document controller/processor roles, DPA/subprocessors, data residency, legal basis, purpose, retention, deletion/export, and incident process before production data is sent to any provider.
- Default to aggregates or pseudonymous IDs; never send passwords/tokens, payment provider data, exact address/GPS, SMTP/Firebase credentials, or raw financial credentials.
- Resolve tenant/restaurant/branch from authenticated server context; repository methods require scope. Add negative cross-tenant/restaurant/branch tests for every endpoint, tool, job, cache, and deletion path.
- Add a distinct permission/feature flag per AI capability. Subscription feature gates may package AI later, but cannot replace RBAC.
- Consider all user, menu, review, chat, and retrieved text untrusted. Delimit data, validate structured output, cap tool rounds, allowlist tools, inject scope server-side, and never follow instructions found in retrieved content.
- Record prompt/model/schema versions, tool names/arguments after redaction, snapshot ID, policy decisions, actor, approval, status, latency, tokens/cost, and correlation ID. Do not log full raw prompts by default.
- Require explicit approval for any persistence, send, or customer-visible action. Re-check authorization, consent, source version, eligibility, and idempotency at apply/send time.
- Per-user, per-restaurant, and global rate limits/budgets; hard token/tool/time bounds; circuit breaker/kill switch; provider timeout; deterministic fallback.
- Encrypt sensitive persisted artifacts, separate analytics from operational DB transactions, and test deletion/retention jobs. Back up before migrations.

## 7. Database, query, cache, and performance plan

- **Analytics MVP query shape:** one scoped aggregate/snapshot build per request, not N+1 tool calls. Reuse report status semantics. Select only required fields, aggregate in PostgreSQL, and cap date range/top lists. Record query count and `EXPLAIN (ANALYZE, BUFFERS)` on representative anonymized data before rollout.
- Existing useful indexes include `Order(branchId,status,createdAt)`, `Order(restaurantId,status,paidAt,createdAt)`, `OrderItem(orderId)`, `PaymentTransaction(restaurantId,branchId,createdAt)`, `OrderReview(restaurantId,createdAt)`, and scoped notification indexes. New indexes must follow observed query plans; do not add speculative duplicates.
- Avoid holding a transaction while calling a provider. Snapshot and commit first, call provider, then persist outcome with optimistic source hash/version.
- Partition/batch offline work by tenant/restaurant; default 2 concurrent provider jobs/tenant and 10 globally until load tests justify change. Batch rows ≤500 and payload size ≤256 KiB; store larger artifacts separately only if required.
- Public assistant retrieval returns ≤20 candidates; model context ≤10 items. Analytics top lists ≤25. Support context ≤50 messages/20k characters. Forecast history ≤24 months and configured item cap.
- Cache only deterministic, fully scoped data. Include source watermark/prompt/schema/locale in key; never use shared HTTP caching for personalized AI. Test cold, warm, invalidation, deletion, and scope collision.
- Redis can improve distributed rate limits/queueing later, but **is not current infrastructure in this repo**. PostgreSQL-backed leasing is the lowest-new-infrastructure path for MVP. If Redis/BullMQ is introduced, capacity, persistence, eviction policy, HA, monitoring, backup/recovery, TLS/auth, and failure behavior need an infrastructure review.
- Prove pool impact under concurrency; AI endpoints must have lower bounded DB concurrency than checkout/payment paths and degrade first under pressure.

## 8. Phased milestones and acceptance criteria

### Phase 0 — foundation and policy (2–3 weeks)

- Product decisions in section 10 are approved; provider DPA/data handling reviewed.
- Provider-neutral interfaces, config validation, prompt registry, structured output validation, usage/audit, feature flags, budgets, kill switch, redaction, and evaluation harness exist.
- Cross-tenant tests, provider timeout/fallback, token/cost metering, deletion/retention, and no-secret logging pass.
- No vector DB, Redis, or autonomous write tools are introduced without a separate decision.

### Phase 1 — read-only Analytics Copilot MVP (3–5 weeks)

- Canonical typed analytics snapshot reuses existing report definitions and has documented query count/range bounds.
- Partner Reports panel answers an approved golden set with source metrics and freshness.
- The model has no SQL/network/write tool; no PII leaves FeastFlow; no financial/order/menu state can change.
- Numeric traceability = 100%, cross-tenant leakage = 0, golden correctness ≥90%, and configured p95 latency/cost budgets pass.
- Internal then opt-in pilot succeeds with feedback, kill switch, and rollback to deterministic reports.

### Phase 2 — menu and support drafting (6–10 weeks, can partly parallelize)

- Menu descriptions/translations and support replies remain drafts with source-version conflict checks and approval audit.
- Zero ungrounded allergen/nutrition promises in release evaluation; zero PII redaction leakage.
- Existing manual workflows remain available and unchanged on provider failure.

### Phase 3 — deterministic intelligence (8–14 weeks)

- Forecasting and anomaly engines beat approved baselines in shadow mode; LLM only explains their outputs.
- Jobs are bounded, restart-safe, idempotent, and do not pressure checkout/payment pools.
- Alerts/forecasts expose confidence, data sufficiency, version, and evidence.

### Phase 4 — customer assistant (5–8 weeks)

- Catalog retrieval meets approved precision/availability/allergen tests; no order/payment action is available to the model.
- Customer confirms any cart change through normal APIs; anonymous abuse controls, consent, moderation, and fallback pass.

### Phase 5 — retention experimentation (6–9 weeks)

- Consent/suppression/attribution/holdout foundations are production-ready before recommendations are enabled.
- AI drafts cannot activate or send; eligibility and economics are recomputed deterministically at launch.
- Pilot demonstrates incremental margin/retention without unacceptable unsubscribe/complaint or fairness impact.

## 9. What Bilal must provide

### Required now for planning (no keys)

- Confirm rollout order and that Analytics Copilot is read-only first.
- Name product owner, engineering owner, privacy/legal reviewer, and restaurant pilot reviewers.
- Approve initial roles/permissions, pilot tenants, supported languages, metric glossary owner, and target budget/latency envelope.
- Decide data residency/provider acceptability and whether production data may be processed by a third-party LLM under a DPA.

### Required before development (identify/provision securely; do not paste in chat)

- An approved LLM provider account/project, billing budget, DPA/data-retention settings, and **LLM API key** (pragmatic default: OpenAI). Store it through the existing protected environment/config mechanism (Nest `ConfigService`/deployment env); never commit it or paste it into chat.
- Approved model allowlist and monthly/per-tenant spend limits. Model IDs remain config, not code constants.
- Pilot restaurant consent and anonymized evaluation examples/golden questions.
- Privacy/retention/consent copy, support escalation playbook, brand voice, locale terminology, and allergen/legal review for the features entering development.
- If Redis/BullMQ is approved later: managed/self-hosted Redis decision, deployment, TLS/auth, monitoring, and a protected `REDIS_URL`. Not required for Analytics MVP.

### Optional later, only if the relevant feature is approved

- pgvector enablement in existing PostgreSQL (no API account/key) or a managed vector-store account/key; not needed for Analytics MVP.
- DeepL account/key for independently evaluated translation; otherwise use the selected multilingual LLM.
- Weather/events data account/key for forecasting if measured lift justifies it.
- Sentry DSN or OpenTelemetry backend credentials for richer observability; existing logs/system-health remain the baseline.
- SMS provider account/key and verified sender only if SMS campaigns/support are approved. Email already uses SMTP settings; push already uses Firebase service-account configuration, but production availability/consent still must be verified.
- No separate OpenAI moderation key is expected when using the same approved OpenAI project/key; moderation policy still requires configuration and evaluation.

## 10. Genuine product decisions needed

1. Which roles may use each feature, and may Super Admin view cross-restaurant aggregates or only an explicitly selected restaurant?
2. Which Analytics MVP questions/metrics and comparison semantics are authoritative (gross/net revenue, refunded orders, tax/tips/fees, timezone, successful statuses)?
3. Which languages launch first, and who approves restaurant terminology and legally sensitive allergen/nutrition wording?
4. What are the provider/data residency/DPA constraints, artifact retention periods, and customer/restaurant opt-in model?
5. What monthly global/per-tenant cost, request rate, and latency SLOs should hard limits enforce?
6. For forecasting: horizon/granularity and whether external weather/holiday/event data is allowed.
7. For promotions: churn definition, lawful marketing basis, minimum margin, frequency/quiet-hour caps, and experiment/holdout policy.
8. For support/anomalies: escalation owner, prohibited auto-responses, SLOs, severity thresholds, and acknowledgement workflow.
9. Is a Redis service acceptable later, or should FeastFlow retain PostgreSQL-backed jobs until measured load requires BullMQ?

## 11. Delivery checklist per implementation PR

- Link requirements, threat/privacy review, prompt/schema/tool versions, affected roles/scopes, and feature flag.
- Include migration backup/restore plan when models/indexes change; never run a migration without backup.
- Unit, integration, cross-tenant, prompt-injection, moderation, timeout, fallback, budget, idempotency, concurrency, retention/deletion, query-count, and cold/warm cache tests.
- Run Prisma validate/generate, typecheck, build, tests, lint, format, and repository policy checks.
- Record model/provider/evaluation date, golden dataset version, cost/latency results, query plans, pool/load results, and rollback/kill-switch proof.
- Deploy only after source ancestry is proved against the deployed commit and standard FeastFlow release safeguards pass.
