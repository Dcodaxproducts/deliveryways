# Localization Tasks

## Phase 1: Foundation
- [x] Add locale normalization helper with validation and fallback rules.
- [x] Add `EntityTranslation` Prisma model and migration plan.
- [x] Add localization module/repository/service/controller.
- [x] Add translation field allowlists by entity type.
- [x] Add ownership validation for each supported entity type.
- [x] Add unit tests for locale normalization and field allowlist filtering.

## Phase 2: Admin Translation Management
- [x] Add upsert translation endpoint.
- [x] Add list/detail translation endpoint.
- [x] Add delete/deactivate translation endpoint.
- [x] Add tests for create/update/read/delete and wrong-restaurant rejection.

## Phase 3: Customer/Public Catalog Overlay
- [ ] Add optional `locale` to customer app query DTOs.
- [ ] Batch-load translations for home screen restaurant/branch/categories/items/promotions.
- [ ] Overlay translations in `mapMenuItem`, `mapCuisineCategory`, and public promotion mapping.
- [ ] Add tests for default responses, translated responses, and partial fallback.

## Phase 4: Admin/Menu Overlay
- [ ] Add optional `locale` to menu list/detail DTOs where frontend needs translated preview.
- [ ] Overlay menu/category/item/variation/modifier responses without changing writes.
- [ ] Add focused menu service/repository tests.

## Phase 5: Verification And Release
- [x] Run `npx tsc --noEmit`.
- [x] Run focused Jest suites for localization/customer/menu.
- [x] Run `npm run build`.
- [x] Run full `npm test`.
- [x] Run `npm run lint`.
- [ ] Commit and push only when checks pass.
