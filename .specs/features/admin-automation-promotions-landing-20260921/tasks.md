# DeliveryWay Admin, Automation, Promotions, and Landing Tasks

## Phase 1: Correctness Foundation

- [ ] T1: Resolve actual branch admin in API and remove viewer fallback in Restaurant Admin. Requirement ADM-01.
- [ ] T2: Add and test canonical auto-accept decision/transition in order creation and payment finalization. Requirement ORD-01.

## Phase 2: Promotion Fulfillment Scope

- [ ] T3: Add `allowedOrderTypes` and `showOnLanding` schema fields with forward/rollback migration. Requirements PROMO-01, LAND-02.
- [ ] T4: Enforce promotion fulfillment eligibility in coupon validation and automatic promotion selection. Requirement PROMO-01.
- [ ] T5: Add fulfillment scope to Restaurant Admin promotion create/edit UI and service types. Requirement PROMO-01.

## Phase 3: Landing Ownership

- [ ] T6: Add Superadmin package landing-display control and API public filtering. Requirement LAND-02.
- [ ] T7: Extend the landing settings provider to consume the managed home contract. Requirement LAND-01.
- [ ] T8: Migrate homepage sections to managed content/visibility and remove hard-coded copy fallback. Requirement LAND-01.
- [ ] T9: Remove hard-coded package/comparison fallback and hide empty pricing sections. Requirement LAND-02.

## Phase 4: Verification

- [ ] T10: Run migrations on a disposable database; run focused and full API/Admin/Superadmin/Landing gates; perform responsive read-only UAT; commit and push each repository.

## Verification Contract

- API: Prisma validate/generate, migration apply/rollback proof on disposable PostgreSQL, focused Jest, full Jest, TypeScript, build, lint.
- Restaurant Admin: focused tests, full tests, TypeScript, build, lint, i18n/import checks.
- Superadmin/Landing: TypeScript, lint, production build, focused component/service tests where harness exists.

