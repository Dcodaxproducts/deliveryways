# Client Regression Batch — Tasks

**Design:** `.specs/features/client-regression-batch-20260729/design.md`
**Status:** Verified

## Phase 1 — Immediate regressions

- [x] T1 Backend: make order detail/status staff-aware within assigned scope. Requirements RBAC-01..04.
- [x] T2 Customer: hydrate selected Deal category items with full modifiers/variations. Requirements DEAL-01..02.
- [x] T3 Restaurant Admin: accept comma/dot decimal delivery configuration. Requirement BRANCH-01.

## Phase 2 — POS and employee access

- [x] T4 Restaurant Admin: select Main Branch by default in POS. Requirement POS-01.
- [x] T5 Backend/Admin: support unambiguous customer lookup by identity and Order ID. Requirement POS-02.
- [x] T6 Restaurant Admin: add guest contact fields and repair POS checkout payload/state. Requirements POS-03..04.
- [x] T7 Restaurant Admin/Backend: repair employee password UX and grouped permission edit/application. Requirements EMP-01..02, RBAC-05.

## Phase 3 — Payout ownership and security

- [x] T8 Restaurant Admin: remove automated provider credential configuration while retaining manual payout requests. Requirement PAY-01.
- [x] T9 Backend/Super Admin: manage per-restaurant Stripe/PayPal payout settings. Requirement PAY-02.
- [x] T10 Backend/Super Admin: add encrypted global Stripe/PayPal settings with masked replace semantics. Requirements PAY-03..04.
- [x] T11 Super Admin: add authenticated Change Password UI. Requirement AUTH-01.

## Phase 4 — Storefront and localization

- [x] T12 Customer/Backend: verify and repair fulfillment price switching plus address handoff. Requirements HOME-01..02.
- [x] T13 Customer/Backend: verify and repair homepage guest online-only Gift Cards. Requirements GIFT-01..03.
- [x] T14 Customer/Admin: translate weekly hours/add-on/quantity labels and fix distance formatting. Requirements I18N-01..04.

## Phase 5 — Verification and delivery

- [x] T15 Run per-file NestJS enforcement after every backend file.
- [x] T16 Run full Backend, Restaurant Admin, Customer, and Super Admin verification.
- [x] T17 Commit and push each affected repository with conventional commits.

## Verification

- Backend: `npx tsc --noEmit`, `npm run build`, `npm test`, `npm run lint`,
  `npx prisma validate`, touched-file `scripts/verify_nestjs.sh`.
- Restaurant Admin: focused tests, `npm test`, `npm run typecheck`,
  `npm run lint`, `npm run check:i18n`, `npm run check:imports`, `npm run build`.
- Customer: focused tests, `npm test`, `npm run typecheck`, `npm run lint`,
  `npm run build`.
- Super Admin: focused tests where present, standalone TypeScript, `npm run lint`,
  EN/DE parity, and `npm run build`.
