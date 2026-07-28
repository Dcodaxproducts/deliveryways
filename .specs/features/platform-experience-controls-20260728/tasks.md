# DeliveryWay Platform Experience Controls Tasks

## 1. Fast order placement and branch email

- [x] 1.1 Refactor order-placed notification dispatch so SMTP is outside the
  synchronous response path. (`ORD-PERF-01`)
- [x] 1.2 Add branch notification settings read/update contract with
  branch-safe authorization. (`NOTIF-BR-01`)
- [x] 1.3 Prefer branch new-order email and retain restaurant fallback.
  (`NOTIF-BR-02`)
- [x] 1.4 Add focused notification and branch-setting tests.

## 2. Promotion audience

- [x] 2.1 Add the Prisma enum/column and backward-compatible migration.
  (`PROM-AUD-01`)
- [x] 2.2 Extend campaign DTOs, services, and admin responses.
  (`PROM-AUD-01`)
- [x] 2.3 Enforce audience in public lists, validation, quote, and checkout.
  (`PROM-AUD-02`)
- [x] 2.4 Add Restaurant Admin audience controls and focused tests.

## 3. Dynamic homepage

- [x] 3.1 Extend landing-settings normalization/DTOs/public contract with
  homepage sections and selected restaurants. (`LAND-HOME-01`,
  `LAND-HOME-02`)
- [x] 3.2 Extend Superadmin Landing Content controls.
- [x] 3.3 Bind Landing hero, featured restaurants, checklist sections, and app
  CTA to managed content with existing fallbacks.
- [x] 3.4 Add normalization and rendering/build verification.

## 4. Generated invoice access

- [x] 4.1 Add an authorized generated-invoice document endpoint.
  (`INV-HIST-01`, `INV-HIST-02`)
- [x] 4.2 Add Superadmin view/download actions.
- [x] 4.3 Ensure Restaurant Admin lists and opens its authorized generated
  invoices.
- [x] 4.4 Add authorization and unavailable-document tests.

## 5. Restaurant Admin compact operations UI

- [x] 5.1 Shorten browser/application metadata. (`ADMIN-UI-01`)
- [x] 5.2 Remove Customer Info from desktop/mobile order lists only.
  (`ADMIN-UI-02`)
- [x] 5.3 Add branch order-email configuration UI.

## 6. Verification and delivery

- [x] 6.1 Run per-file backend enforcement scripts where available.
- [ ] 6.2 Run backend project typecheck/build/tests/lint.
- [ ] 6.3 Run affected frontend typecheck/build/tests/lint.
- [ ] 6.4 Commit atomic verified changes and push the feature branches.
- [ ] 6.5 Provide the server pull/deploy commands; do not deploy.
