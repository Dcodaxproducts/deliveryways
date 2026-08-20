# Client-reported 13-issue batch tasks

## Backend

- [x] T1 (CR13-02): stabilize payout period boundaries and duplicate protection; verify package-plan tests.
- [x] T2 (CR13-03): add audited Super Admin cancel/recreate invoice APIs; verify service/controller tests and Prisma migration.
- [x] T3 (CR13-04, CR13-13): expose/refine net provider, COD, and online totals; verify report repository/service tests.
- [x] T4 (CR13-06): suppress admin PAYMENT_PAID feed records; verify notification tests.
- [x] T5 (CR13-10): register and enforce WinOrder permission module; verify permission/guard tests.
- [x] T6 (CR13-12): cap aggregate all-order commission per subscription period and payout cycle; verify cap/refund/order-method cases.

## Restaurant Admin

- [x] T7 (CR13-01): render `#displayNumber` in restaurant picker; verify component/helper tests and typecheck.
- [x] T8 (CR13-03): expose Super Admin invoice actions in the Super Admin history UI contract.
- [x] T9 (CR13-05): regression-verify existing category Load More scroll/click fix.
- [x] T10 (CR13-08): accept empty WhatsApp while validating supplied values.
- [x] T11 (CR13-09): display ONLINE PAID for Stripe/PayPal in order/report surfaces.
- [x] T12 (CR13-11): allow authorized Restaurant Admin/staff modifier detach wherever attach is allowed.
- [x] T13 (CR13-13): reduce financial cards to six requested totals.

## Customer and Super Admin

- [x] T14 (CR13-07): disable browser autocomplete on guest address inputs without affecting location selection.
- [x] T15 (CR13-09): display provider-aware paid status in customer order summary.
- [x] T16 (CR13-03): add Super Admin cancel/recreate mutations and history actions.

## Verification and release

- [x] T17: run touched-file enforcement, focused tests, typecheck, lint, full tests, production builds, Prisma validation, and Docker/project verification where available.
- [ ] T18: commit atomically, push all changed repository branches, verify remote commits, and capture durable handoff context.
