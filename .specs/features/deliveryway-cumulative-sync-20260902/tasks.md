# FeastFlow Cumulative DeliveryWay Sync Tasks

**Design**: `.specs/features/deliveryway-cumulative-sync-20260902/design.md`
**Status**: Complete — Production launch intentionally pending secrets and approval

## Execution Plan

T1 → T2 → T3 → T4 → T5 → T6 → T7

## T1: Inventory and Baseline Proof

**Requirement**: SYNC-05

**Done when**:

- [x] Source ancestry and exact release heads are proven.
- [x] All FeastFlow repositories are clean and aligned to `origin/main`.
- [x] Baseline builds pass with required public build-time URLs.

## T2: Port Cumulative API Contract

**Where**: Prisma schema/migration and affected auth, branch, order, package-plan, and payment files.
**Requirements**: SYNC-01, SYNC-05

**Done when**:

- [x] Source behavior is adapted without DeliveryWay identity leakage.
- [x] Changed backend lines add no new `verify_nestjs.sh` violations; the full repository remains at its 62-finding legacy baseline.
- [x] Typecheck, build, lint, and full tests pass (102 suites / 1,187 tests).

**Commit**: `feat(platform): sync cumulative billing and order controls`

## T3: Port Restaurant Admin Contract

**Requirements**: SYNC-02, SYNC-05

**Done when**:

- [x] Storefront promotion, default-branch restrictions, and monthly payout state are present.
- [x] FeastFlow branding defaults and English default remain intact.
- [x] Lint, typecheck, tests (91 files / 562 tests), import check, 3,241-key i18n parity, and build pass.

**Commit**: `feat(admin): sync billing and branch controls`

## T4: Port Superadmin Contract

**Requirements**: SYNC-03, SYNC-05

**Done when**:

- [x] Order uncancel, Make Default, and monthly payout/invoice state are present.
- [x] FeastFlow portal URLs and English default remain intact.
- [x] Lint, typecheck, 1,828-key i18n parity, and build pass.

**Commit**: `feat(superadmin): sync order and billing controls`

## T5: Port Landing Onboarding Contract

**Requirements**: SYNC-04, SYNC-05

**Done when**:

- [x] Registration preserves package selection without immediate payment redirect.
- [x] FeastFlow identity and URLs remain intact.
- [x] Lint, typecheck, i18n check, and build pass.

**Commit**: `fix(onboarding): defer package payment after registration`

## T6: Full Isolation and Release Verification

**Requirements**: SYNC-01, SYNC-02, SYNC-03, SYNC-04, SYNC-05

**Done when**:

- [x] All affected repositories pass their executable verification surfaces.
- [x] Customer unchanged repository passes lint, typecheck, 83 files / 577 tests, and build.
- [x] Tracked-file isolation scan finds no DeliveryWay identity/runtime leakage.
- [ ] All commits are pushed and remote heads match.

## T7: Production Edge Readiness

**Requirements**: EDGE-01, EDGE-02

**Done when**:

- [x] Exact/wildcard DNS and TLS are valid.
- [x] Reverse proxy ports match the approved layout.
- [x] Legacy demo hosts remain healthy.
- [x] Guarded preflight stops before runtime/database mutation; the handoff remains separate from the root-owned runtime env and has 17 missing provider values.
