# American Corner Pilot Readiness Tasks

**Design:** `.specs/features/american-corner-pilot-readiness/design.md`
**Status:** In Progress

## Execution Plan

### T1: Extend printing settings with paper size

- **Depends on:** None
- **Requirements:** PAPER-01
- **Done when:** DTO/service tests accept four sizes, reject others, and default existing settings to 80MM.
- **Verify:** focused backend printing tests and per-file enforcement.
- **Commit:** `feat(printing): add paper size settings`

### T2: Render and print paper-specific order tickets

- **Depends on:** T1
- **Requirements:** PAPER-02, PRINT-03
- **Done when:** pure ticket tests cover all sizes and QZ receives the matching configuration.
- **Verify:** focused Restaurant Admin local-printer tests.
- **Commit:** `feat(printing): render paper-specific order tickets`

### T3: Trigger duplicate-safe printing on accepted orders

- **Depends on:** T2
- **Requirements:** PRINT-01, PRINT-02, PRINT-03
- **Done when:** accepted event prints once, replay is suppressed, disabled settings do not print, failure is non-blocking and reported.
- **Verify:** focused order printing integration tests.
- **Commit:** `feat(printing): auto-print accepted orders`

### T4: Add custom-domain DNS verification API

- **Depends on:** None
- **Requirements:** DOMAIN-01, DOMAIN-02
- **Done when:** matching CNAME verifies; mismatch, NXDOMAIN, and missing config do not; authorization remains enforced.
- **Verify:** focused Restaurants controller/service tests and per-file enforcement.
- **Commit:** `feat(domains): verify storefront DNS`

### T5: Add Super Admin DNS instructions and verification controls

- **Depends on:** T4
- **Requirements:** DOMAIN-01, DOMAIN-02
- **Done when:** exact target, pending/verified state, verification action, and errors render with EN/DE text.
- **Verify:** focused component tests, i18n parity, typecheck.
- **Commit:** `feat(domains): add DNS verification controls`

### T6: Full regression and handoff

- **Depends on:** T1-T5
- **Requirements:** REG-01
- **Done when:** all repository checks pass, branches are pushed, and no deployment occurred.
- **Verify:** backend/admin/superadmin full build, test, typecheck, lint, Prisma validation, and project enforcement surfaces where available.

