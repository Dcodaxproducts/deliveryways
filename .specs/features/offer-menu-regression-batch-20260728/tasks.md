# Tasks

- [x] **T1 — Schema and DTO contract** (OFFER-01..07, OFFER-06)
  - Extend category selection groups and add coupon order.
  - Add create/update/read DTOs with validation.
  - Prove Prisma validation/generation and DTO tests.

- [x] **T2 — Deal validation and pricing** (OFFER-02..05, OFFER-07..08)
  - Resolve group eligibility.
  - Validate exact per-group quantities including repeated items.
  - Preserve legacy fallback.
  - Add cart/order/coupon regressions.

- [x] **T3 — Coupon deletion and Happy Hour schedule** (COUPON-01, HAPPY-01..03)
  - Complete authorized delete flow.
  - Correct timezone/boundary handling and homepage payload.
  - Add service/controller tests.

- [x] **T4 — Admin deal and menu UX** (OFFER-01..06, COUPON-01, MENU-01,
  INFO-02..03)
  - Build mixed fixed-item/category editor with inclusion/exclusion controls.
  - Add deal DnD and coupon delete.
  - Correct item DnD/order and allergen/additive selectors.
  - Add focused component/service tests.

- [x] **T5 — Customer deal and product UX** (OFFER-01..05, HAPPY-01..03,
  MENU-02, INFO-01..02, ITEM-01..02)
  - Render group instances and repeatable choices.
  - Render/expire Happy Hours.
  - Correct category navigation and product information.
  - Remove fallback description and placeholder image.
  - Add focused tests.

- [x] **T6 — Full verification and release**
  - Run all three full proof surfaces.
  - Apply all migrations to a PostgreSQL 16 scratch database.
  - Verify SMTP authentication and provider acceptance in development and
    production.
  - Commit atomically and push the cumulative branch.
  - Provide exact SHAs and migration/deployment notes.
