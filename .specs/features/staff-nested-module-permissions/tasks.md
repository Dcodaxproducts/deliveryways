# Staff Nested Module Permissions Tasks

**Status**: Verified

## Task Breakdown

### T1: Complete the route-permission matrix

- Map Deliveryman dashboard stats to `deliveryman`.
- Verify Loyalty, Coupons, FAQs, Payments, and Deliverymen route families.
- Add operation-specific guard allow/deny tests.

### T2: Align Loyalty service scope

- Permit guard-authorized STAFF program reads and updates.
- Deny unassigned restaurant and cross-tenant targets.

### T3: Align Deliveryman service scope

- Permit assigned/all-restaurants STAFF target access.
- Keep explicit restaurant and owner-tenant isolation.
- Verify detail/edit/assign prerequisites.

### T4: Align coupon service scope

- Resolve and validate STAFF requested restaurant IDs.
- Permit assigned coupon delete and deny outside-scope delete.

### T5: Align payment service and UI

- Permit scoped STAFF targets after guard authorization.
- Render Payment Settings for permissioned STAFF.
- Gate update/create controls by operation.

### T6: Fix FAQ edit hydration

- Normalize `data.items` and prefill the selected FAQ.
- Add service regression coverage.

### T7: Full verification and release

- Run per-file enforcement, full tests, typechecks, builds, lint, Prisma,
  imports, and i18n checks.
- Commit and push affected repositories.

## Verification

- Backend: 82 suites / 999 tests.
- Restaurant Admin: 80 files / 460 tests.
- Backend and Admin typechecks, production builds, and lint passed.
- Prisma schema validation, Admin import casing, and i18n parity passed.
- The repository-wide architecture scanner remains at the existing 60-item
  baseline; no new direct data-access violations were introduced.
- No database migration.
