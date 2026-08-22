# DeliveryWay Today's Client Issues — Tasks

## Phase 1 — Contracts and backend correctness

### T1 Staff report authorization
- Update `RolesGuard` mapping for order reports and generated order invoices.
- Verify guard regression tests. Requirement: ACCESS-01.

### T2 Commission and active subscription terms
- Prove percentage/fixed/cap and offline exclusions with tests.
- Expose the active plan/commission terms in restaurant wallet/management responses.
- Verify payment/package-plan service tests. Requirement: PAY-01.

### T3 Stable duplicate ordering
- Allocate duplicated items after the current maximum restaurant sort order.
- Add stable list tie-breaker and service/repository tests. Requirement: ITEMS-01.

## Phase 2 — User interfaces

### T4 Restaurant Admin staff/orders/invoices/settings
- Keep Today as default, align report permission use, show active plan terms, and remove obsolete global transaction fields.
- Verify component/helper tests and typecheck. Requirements: ACCESS-01, ORDER-01, PAY-01, SETTINGS-01.

### T5 Customer checkout fee and tips
- Preserve transaction fee fields in checkout normalization.
- Add preset tip actions and custom input mode.
- Verify normalizer and component tests. Requirements: CHECKOUT-01, CHECKOUT-02.

### T6 Complete Items pagination
- Ensure only one responsive infinite-scroll observer can request the next page and prevent duplicate increments.
- Verify sequential-page tests and copied-item refresh behavior. Requirement: ITEMS-01.

### T7 Super Admin generated invoice View
- Add PDF View service/hook/action with error and loading states.
- Verify service/component tests and typecheck. Requirement: INVOICE-01.

### T8 Subscription presentation and refresh
- Ensure subscription switch refreshes all related queries and the invoice modal matches the supplied detailed hierarchy.
- Verify modal/query tests and build. Requirements: PAY-01, INVOICE-02.

## Phase 3 — Full verification and delivery

### T9 Full gates
- API: Prisma validate/generate, typecheck, build, lint, full tests, migration scratch verification if schema changes.
- Each frontend: tests, typecheck, production build, lint, translation parity.
- Run `git diff --check`, commit atomically, and push all branches. No deployment.

