# Cart and Printer Reliability Tasks

**Design**: `.specs/features/cart-printer-reliability/design.md`
**Status**: Complete

## Execution Plan

### Phase 1: Backend cart

T1 -> T2 -> T3

### Phase 2: Customer integration

T3 -> T4 -> T5

### Phase 3: Printer workflow

T6 -> T7 -> T8

### Phase 4: Verification

T5 + T8 -> T9

## Task Breakdown

### T1: Add batch cart DTO and route

**Where**: `src/modules/cart/dto.ts`, `src/modules/cart/cart.controller.ts`
**Requirements**: CARTPERF-01
**Done when**: The authenticated/guest-compatible route accepts 1-25 validated cart lines.
**Verify**: DTO and controller tests pass; NestJS verifier passes for both files.

### T2: Add transaction-aware cart item writes

**Where**: `src/modules/cart/cart.repository.ts`
**Depends on**: T1
**Requirements**: CARTPERF-02
**Done when**: Item create/update methods can use the caller transaction without changing
existing callers.
**Verify**: Repository tests pass; NestJS verifier passes.

### T3: Implement atomic batch service

**Where**: `src/modules/cart/cart.service.ts`, `src/modules/cart/cart.service.spec.ts`
**Depends on**: T1, T2
**Requirements**: CARTPERF-01, CARTPERF-02
**Done when**: All lines validate, one transaction writes them, and one final response is
built; failure writes nothing.
**Verify**: Focused cart tests and NestJS verifier pass.

### T4: Add customer batch API

**Where**: Customer `src/services/cart.ts`, `src/services/cart.test.ts`
**Depends on**: T3
**Requirements**: CARTPERF-03
**Done when**: A typed client function submits the complete item array once.
**Verify**: Cart service tests pass.

### T5: Replace sequential deal mutation

**Where**: Customer `src/hooks/useCart.ts`, related hook tests
**Depends on**: T4
**Requirements**: CARTPERF-03
**Done when**: Deal addition performs one batch mutation, reuses its cart response, and
does not perform an immediate quote request.
**Verify**: Focused deal/cart tests, typecheck, lint, and build pass.

### T6: Validate effective printer configuration and report events

**Where**: Backend admin printing DTO/controller/service/spec files
**Requirements**: PRINT-02, PRINT-04
**Done when**: Incomplete enabled/local settings are rejected and authenticated scoped
events enter printer health logs.
**Verify**: Focused admin printing tests and per-file NestJS verification pass.

### T7: Add QZ local printer adapter

**Where**: Admin package files and `src/lib/local-printer.ts`
**Depends on**: T6
**Requirements**: PRINT-01, PRINT-03
**Done when**: Adapter connects, lists queues, prints a test ticket, and returns actionable
errors without server-side execution.
**Verify**: Adapter unit tests, typecheck, and lint pass.

### T8: Wire printer discovery and validation UI

**Where**: Admin printing service/hook/component/messages/tests
**Depends on**: T7
**Requirements**: PRINT-01, PRINT-02, PRINT-03, PRINT-04
**Done when**: Empty save is blocked; discovery populates a select; test output and backend
health reporting are observable.
**Verify**: Focused UI tests, i18n parity, typecheck, lint, and build pass.

### T9: Full regression verification and delivery

**Depends on**: T5, T8
**Done when**: All three projects pass their full verification surfaces; atomic commits are
pushed and exact remote heads are confirmed.
**Verify**: Backend `scripts/verify_project.sh`; frontend full tests/typecheck/lint/build.
