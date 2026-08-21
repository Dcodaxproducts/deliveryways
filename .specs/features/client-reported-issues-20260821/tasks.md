# Client-reported order and platform corrections tasks

## Order list and financial summaries

- [ ] T1 (CR21-01, CR21-02, CR21-03): add authoritative list/report date, schedule, and excluded-status filters with repository/DTO tests.
- [ ] T2 (CR21-01, CR21-02, CR21-03): make Today the default Restaurant Admin tab and remove client-after-pagination filtering.
- [ ] T3 (CR21-04, CR21-05): return recognized full-order revenue plus COD/digital totals and render six currency-aware summary cards.
- [ ] T4 (CR21-06, CR21-07): make orders table horizontally scrollable and localize COD without literal currency symbols.

## Pricing, tax, and commission

- [ ] T5 (CR21-04): calculate commission from every eligible confirmed full order total, independently of online payment settlement.
- [ ] T6 (CR21-08): hide tax in requested customer/admin order summary surfaces without altering stored totals.
- [ ] T7 (CR21-09): reproduce and fix durable global tax-type default persistence/reflection with API and UI tests.
- [ ] T8 (CR21-10): add explicit online-payment fee ownership, quote/order calculation, customer display, and regression tests.

## Entitlements and permissions

- [ ] T9 (CR21-11): verify subscription switch persistence and feature-module enforcement; repair any badge-only path.
- [ ] T10 (CR21-12): verify and repair WinOrder staff navigation and API permission enforcement.

## Presentation and notifications

- [ ] T11 (CR21-13): correct address normalization/display formatting while preserving coordinates.
- [ ] T12 (CR21-14): review and repair automatic/manual receipt layout with focused rendering tests.
- [ ] T13 (CR21-06): increase mobile item title/description typography on affected order/customer surfaces.
- [ ] T14 (CR21-15): persist notification sound mode and use the supplied audio asset with hook/settings tests.

## Verification and delivery

- [ ] T15: run per-file enforcement, focused tests, Prisma validation/generation, typecheck, lint, full tests, builds, and project verification.
- [ ] T16: commit and push atomic repository changes, verify remote commits, and produce a deployment-ready handoff without deploying.
