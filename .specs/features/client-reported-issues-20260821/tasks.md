# Client-reported order and platform corrections tasks

## Order list and financial summaries

- [x] T1 (CR21-01, CR21-02, CR21-03): add authoritative list/report date, schedule, and excluded-status filters with repository/DTO tests.
- [x] T2 (CR21-01, CR21-02, CR21-03): make Today the default Restaurant Admin tab and remove client-after-pagination filtering.
- [x] T3 (CR21-04, CR21-05): return recognized full-order revenue plus COD/digital totals and render six currency-aware summary cards.
- [x] T4 (CR21-06, CR21-07): make orders table horizontally scrollable and localize COD without literal currency symbols.

## Pricing, tax, and commission

- [x] T5 (CR21-04): calculate commission from every eligible confirmed full order total, independently of online payment settlement.
- [x] T6 (CR21-08): hide tax in requested customer/admin order summary surfaces without altering stored totals.
- [x] T7 (CR21-09): reproduce and fix durable global tax-type default persistence/reflection with API and UI tests.
- [x] T8 (CR21-10): add explicit online-payment fee ownership, quote/order calculation, customer display, and regression tests.

## Entitlements and permissions

- [x] T9 (CR21-11): verify subscription switch persistence and feature-module enforcement; repair any badge-only path.
- [x] T10 (CR21-12): verify and repair WinOrder staff navigation and API permission enforcement.

## Presentation and notifications

- [x] T11 (CR21-13): correct address normalization/display formatting while preserving coordinates.
- [x] T12 (CR21-14): review and repair automatic/manual receipt layout with focused rendering tests.
- [x] T13 (CR21-06): increase mobile item title/description typography on affected order/customer surfaces.
- [x] T14 (CR21-15): persist notification sound mode and use the supplied audio asset with hook/settings tests.

## Verification and delivery

- [x] T15: run per-file enforcement, focused tests, Prisma validation/generation, typecheck, lint, full tests, builds, and project verification.
- [x] T16: commit and push atomic repository changes, verify remote commits, and produce a deployment-ready handoff without deploying.
