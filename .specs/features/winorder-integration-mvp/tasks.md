# WinOrder Integration MVP Tasks

**Design**: `.specs/features/winorder-integration-mvp/design.md`  
**Status**: In Progress

## Execution Plan

T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11

The shared Prisma contract and public module ports make the backend tasks sequential. Restaurant Admin tasks start after the admin API response types stabilize.

## Task Breakdown

### T1: Capture the approved contract and design

**What**: Store the source-backed requirements, decisions, architecture, and task traceability.
**Where**: `.specs/features/winorder-integration-mvp/`
**Depends on**: None
**Requirements**: WIN-01 through WIN-10

**Done when**:

- [x] REST/auth/payload behavior is backed by WinOrder v1.8.14 and its official PHP reference.
- [x] Credential ownership, role boundaries, state isolation, mappings, and status behavior are explicit.
- [x] All requirements map to implementation tasks.

**Verify**: `git diff --check -- .specs/features/winorder-integration-mvp`
**Commit**: `docs(winorder): specify REST integration MVP`

### T2: Add WinOrder-owned persistence and Orders ETA fields

**What**: Add prefixed Prisma enums/models and a forward migration with tenant-first indexes; extend Order with integration ETA fields.
**Where**: `prisma/schema.prisma`, `prisma/migrations/<timestamp>_add_winorder_integration_mvp/migration.sql`
**Depends on**: T1
**Requirements**: WIN-01, WIN-02, WIN-03, WIN-06, WIN-07, WIN-09

**Done when**:

- [x] Prisma format/validate/generate pass.
- [x] Migration is additive, has a documented rollback surface, and does not contain restaurant-specific data.
- [x] Every WinOrder table has non-null tenant/restaurant/branch scope and tenant-first indexes.

**Verify**: `npx prisma format && npx prisma validate && npx prisma generate`
**Commit**: `feat(winorder): add integration persistence model`

### T3: Add Orders and Menu public integration ports

**What**: Expose normalized order export/status and catalog validation contracts without importing module internals.
**Where**: `src/modules/orders/`, `src/modules/menu/`
**Depends on**: T2
**Requirements**: WIN-03, WIN-04, WIN-05, WIN-08

**Done when**:

- [x] WinOrder can inject both ports only through module barrels/tokens.
- [x] Order export candidates are branch scoped and normalized from snapshots.
- [x] Status progression and ETA updates remain owned by Orders.
- [x] Catalog keys are listed/validated within Menu ownership.
- [x] Focused unit tests, TypeScript, and targeted ESLint pass. The repository no longer contains `scripts/verify_nestjs.sh`, so its equivalent checks will be covered by available full-project verification in T11.

**Commit**: `feat(winorder): expose order and catalog integration ports`

### T4: Implement branch connection administration and machine authentication

**What**: Create connection repository/service/admin endpoints, one-time credential generation/rotation, and Basic Auth guard.
**Where**: `src/modules/winorder-integration/`
**Depends on**: T3
**Requirements**: WIN-01, WIN-02

**Done when**:

- [ ] Business/Super Admin can create, update, rotate, disable, and read scoped connections.
- [ ] Branch Admin can read only its own connection.
- [ ] Plain secrets are returned once and never persisted.
- [ ] Old, invalid, cross-branch, and disabled credentials fail generically.
- [ ] Unit tests and per-file verification pass.

**Commit**: `feat(winorder): add branch connection credentials`

### T5: Implement catalog and payment mapping administration

**What**: Add list/replace APIs, Menu-port validation, payment-label validation, and mapping completeness diagnostics.
**Where**: `src/modules/winorder-integration/`
**Depends on**: T4
**Requirements**: WIN-03, WIN-04

**Done when**:

- [ ] Cross-restaurant keys are rejected.
- [ ] Item+variation, modifier, service-charge, and payment mappings are deterministic and replaceable.
- [ ] Missing mappings return stable local keys and reasons.
- [ ] Unit tests and per-file verification pass.

**Commit**: `feat(winorder): add catalog and payment mappings`

### T6: Implement idempotent `GetNewOrders`

**What**: Lease eligible branch orders, validate mappings, emit the exact WinOrder `OrderList` JSON envelope, and retain retryable failures.
**Where**: `src/modules/winorder-integration/`
**Depends on**: T5
**Requirements**: WIN-04, WIN-05, WIN-06

**Done when**:

- [ ] Empty and populated responses match the source contract.
- [ ] Concurrent/repeated polls cannot create two active exports for one connection/order.
- [ ] Acknowledged exports are never offered again.
- [ ] Payload tests cover customer/address, item/variation, modifiers, fees, discount, tip, payment, and store values.

**Commit**: `feat(winorder): export branch orders for polling`

### T7: Implement idempotent `SendTrackingStatus`

**What**: Authenticate duplicate headers, fingerprint callbacks, acknowledge exports, apply supported status/ETA intent through Orders, and audit all outcomes.
**Where**: `src/modules/winorder-integration/`
**Depends on**: T6
**Requirements**: WIN-07, WIN-08

**Done when**:

- [ ] Status `0`/`OK` makes the export terminal.
- [ ] Statuses 1-11 follow the approved mapping.
- [ ] Duplicate callbacks do not repeat mutations.
- [ ] Callbacks for another connection/order are rejected.
- [ ] Unit tests and per-file verification pass.

**Commit**: `feat(winorder): process POS tracking callbacks`

### T8: Add health and retry operations and wire the module

**What**: Return safe health/mapping/export/event summaries, retry eligible failures, register the module, and update permission metadata where required.
**Where**: `src/modules/winorder-integration/`, `src/app.module.ts`, permission registry files if applicable
**Depends on**: T7
**Requirements**: WIN-09

**Done when**:

- [ ] Responses contain no password hashes or secrets.
- [ ] Only failed/unacknowledged exports can be retried.
- [ ] Module builds through AppModule and integration controller tests pass.
- [ ] All changed backend files pass mechanical verification.

**Commit**: `feat(winorder): add integration health operations`

### T9: Add the Restaurant Admin WinOrder API service

**What**: Implement typed normalization and all connection/mapping/health mutations with unit tests.
**Where**: `src/services/winorder.ts`, `src/services/winorder.test.ts`
**Depends on**: T8
**Requirements**: WIN-10

**Done when**:

- [ ] API envelope variants normalize safely without `any`.
- [ ] Endpoint URL is derived from the configured API base URL.
- [ ] Service tests, TypeScript, and lint pass.

**Commit**: `feat(winorder): add Restaurant Admin API client`

### T10: Add the Restaurant Admin WinOrder page

**What**: Add the responsive setup/mapping/health page, one-time credential display, role-aware controls, navigation, and EN/DE translations.
**Where**: `src/app/(dashboard)/integrations/winorder/`, `src/components/pages/winorder/`, sidebar/auth/i18n files
**Depends on**: T9
**Requirements**: WIN-10

**Done when**:

- [ ] Business Admin can complete configuration and Branch Admin sees read-only own-branch state.
- [ ] Secrets appear only immediately after generation/rotation with a copy warning.
- [ ] Empty/loading/error/missing-mapping states render clearly.
- [ ] Component/service tests, i18n parity, TypeScript, lint, import check, and production build pass.

**Commit**: `feat(winorder): add branch integration settings UI`

### T11: Full verification and handoff

**What**: Run complete backend/admin proof surfaces, update traceability, push both branches, and record deployment/testing prerequisites.
**Where**: specs, GBrain handoff, git remotes
**Depends on**: T10

**Done when**:

- [ ] Backend `verify_project.sh` passes, including type/build/test/lint/pattern checks available in the worktree.
- [ ] Restaurant Admin typecheck/test/lint/import/build checks pass.
- [ ] Both branches are committed, pushed, and remote heads verified.
- [ ] Handoff states that live WinOrder/American Corner activation remains externally unverified.

**Commit**: only verification-driven fixes or docs; no unverified code batching.

## Requirement Coverage

10 requirements, 10 mapped to tasks, 0 unmapped.
