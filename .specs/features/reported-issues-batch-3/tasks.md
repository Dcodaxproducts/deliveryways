# FeastFlow Reported Issues Batch 3 Tasks

**Design**: `.specs/features/reported-issues-batch-3/design.md`
**Status**: In Progress

## Execution Plan

### Foundation

1. T1 repository lookup for active tenant-scoped restaurant names.
2. T2 service validation for restaurant create/update.
3. T3 repository lookup for active restaurant-scoped menu-item names.
4. T4 service validation for menu item create/bulk/update/duplicate.

### Authentication and Customer

5. T5 require interactive guest first names while preserving technical cart guests.
6. T6 provision missing restaurant-scoped customers during verified Google login.
7. T7 add a valid default Customer favicon and preserve branding override.

### Completion

8. T8 run full verification in API and Customer repositories.
9. T9 update `FEASTFLOW-ISSUES.md`, commit, and push each repository.

## Task Breakdown

### T1: Restaurant active-name lookup

**Where**: `src/modules/restaurants/restaurants.repository.ts`
**Requirement**: B3-REST-01
**Done when**: a focused repository/service test proves case-insensitive tenant scope, deleted exclusion, and self-exclusion.

### T2: Restaurant name validation

**Where**: `src/modules/restaurants/restaurants.service.ts`, existing specs
**Depends on**: T1
**Requirement**: B3-REST-01
**Done when**: create/update trim names and reject scoped active collisions with a readable error.

### T3: Menu-item active-name lookup

**Where**: `src/modules/menu/item/item.repository.ts`
**Requirement**: B3-MENU-01
**Done when**: focused tests prove restaurant scope, case-insensitivity, deleted exclusion, and self-exclusion.

### T4: Menu-item name validation

**Where**: `src/modules/menu/item/item.service.ts`, existing specs
**Depends on**: T3
**Requirement**: B3-MENU-01
**Done when**: single, bulk, update, and duplicate flows cannot introduce an active scoped duplicate.

### T5: Required interactive guest names

**Where**: auth guest DTO/service specs and Customer auth validation/form/provider/tests/messages
**Requirement**: B3-GUEST-01
**Done when**: blank interactive form is rejected locally, the API requires firstName, and technical cart sessions explicitly send `Guest Customer`.

### T6: Scoped Google customer provisioning

**Where**: `src/modules/auth/auth.service.ts`, auth specs
**Requirement**: B3-GOOGLE-01
**Done when**: focused tests prove existing-account login, missing-account creation, restaurant scope, and invalid-token rejection.

### T7: Default Customer favicon

**Where**: Customer metadata/icon asset and branding-provider test
**Requirement**: B3-ICON-01
**Done when**: production build contains a valid `/favicon.ico` response and branding override remains covered.

### T8: Full verification

**Depends on**: T1–T7
**Done when**: per-file enforcement, TypeScript, builds, tests, and lint pass in both repositories.

### T9: Tracker and delivery

**Depends on**: T8
**Done when**: tracker records source commits and honest deployment state; conventional commits are pushed and remote parity is proven.
